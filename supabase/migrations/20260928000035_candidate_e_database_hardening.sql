-- ==============================================================================
-- CANDIDATE E: DATABASE HARDENING MIGRATION 35
-- Migration: 20260928000035_candidate_e_database_hardening.sql
-- 
-- Invariants enforced:
-- 1. E10: Database trigger enforcing strictly append-only immutability on portfolio_exit_events
-- 2. E3 & E16: Atomic PostgreSQL function with native SELECT ... FOR UPDATE row locks
--    on portfolio_positions and portfolio_tax_lots
-- ==============================================================================

-- 1. E10: Strictly Append-Only Trigger on portfolio_exit_events
CREATE OR REPLACE FUNCTION public.forbid_portfolio_exit_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'portfolio_exit_events is strictly append-only: UPDATE and DELETE operations are prohibited (E10).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portfolio_exit_events_immutable ON public.portfolio_exit_events;
CREATE TRIGGER trg_portfolio_exit_events_immutable
BEFORE UPDATE OR DELETE ON public.portfolio_exit_events
FOR EACH ROW
EXECUTE FUNCTION public.forbid_portfolio_exit_events_mutation();

-- 2. E3 & E16: Atomic PostgreSQL Exit Execution with FOR UPDATE Locks
CREATE OR REPLACE FUNCTION public.execute_portfolio_exit_atomic(
  p_user_id UUID,
  p_applicant_id UUID,
  p_security_id UUID,
  p_quantity_sold NUMERIC,
  p_execution_price NUMERIC,
  p_idempotency_key VARCHAR,
  p_total_charges NUMERIC,
  p_net_proceeds NUMERIC,
  p_execution_source VARCHAR,
  p_tax_rule_version VARCHAR,
  p_source_record_id VARCHAR,
  p_source_timestamp TIMESTAMPTZ,
  p_execution_date TIMESTAMPTZ,
  p_settlement_date TIMESTAMPTZ,
  p_payload_hash VARCHAR,
  p_metadata JSONB,
  p_charges JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pos RECORD;
  v_lot RECORD;
  v_remaining_needed NUMERIC := p_quantity_sold;
  v_allocated_qty NUMERIC;
  v_allocated_cost NUMERIC;
  v_total_cost_consumed NUMERIC := 0;
  v_new_lot_rem NUMERIC;
  v_exit_tx_id UUID;
  v_realized_pnl NUMERIC;
  v_gain_type VARCHAR;
  v_tax_class VARCHAR;
  v_has_ltcg BOOLEAN := FALSE;
  v_has_stcg BOOLEAN := FALSE;
  v_overall_tax_class VARCHAR;
  v_allocations JSONB := '[]'::jsonb;
  v_days INTEGER;
  v_existing RECORD;
BEGIN
  -- 1. E14: Database-Authoritative Idempotency Check
  SELECT id, exit_status, quantity_sold, execution_price, gross_proceeds,
         total_charges, net_proceeds, cost_basis_consumed, realized_pnl,
         gain_type, tax_classification, tax_rule_version
  INTO v_existing
  FROM public.portfolio_exit_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'is_duplicate', true,
      'exit_id', v_existing.id,
      'exit_status', v_existing.exit_status,
      'quantity_sold', v_existing.quantity_sold,
      'execution_price', v_existing.execution_price,
      'gross_proceeds', v_existing.gross_proceeds,
      'total_charges', v_existing.total_charges,
      'net_proceeds', v_existing.net_proceeds,
      'cost_basis_consumed', v_existing.cost_basis_consumed,
      'realized_pnl', v_existing.realized_pnl,
      'gain_type', v_existing.gain_type,
      'tax_classification', v_existing.tax_classification,
      'tax_rule_version', v_existing.tax_rule_version
    );
  END IF;

  -- 2. E3: Row-level lock on portfolio_positions
  IF p_applicant_id IS NOT NULL THEN
    SELECT * INTO v_pos
    FROM public.portfolio_positions
    WHERE user_id = p_user_id AND security_id = p_security_id AND applicant_id = p_applicant_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_pos
    FROM public.portfolio_positions
    WHERE user_id = p_user_id AND security_id = p_security_id AND applicant_id IS NULL
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSITION_NOT_FOUND: User % has no position in security %', p_user_id, p_security_id;
  END IF;

  IF v_pos.quantity < p_quantity_sold THEN
    RAISE EXCEPTION 'INSUFFICIENT_HOLDING_QUANTITY: Requested % shares, but holding has %', p_quantity_sold, v_pos.quantity;
  END IF;

  -- 3. E3 & E4: Row-level lock on candidate portfolio_tax_lots with deterministic FIFO ordering
  FOR v_lot IN
    SELECT *
    FROM public.portfolio_tax_lots
    WHERE user_id = p_user_id
      AND security_id = p_security_id
      AND (
        (p_applicant_id IS NOT NULL AND applicant_id = p_applicant_id) OR
        (p_applicant_id IS NULL AND applicant_id IS NULL)
      )
      AND is_exhausted = FALSE
    ORDER BY acquisition_date ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_needed <= 0;

    v_allocated_qty := LEAST(v_lot.remaining_quantity, v_remaining_needed);
    v_new_lot_rem := v_lot.remaining_quantity - v_allocated_qty;
    v_allocated_cost := v_allocated_qty * v_lot.cost_per_share;
    v_total_cost_consumed := v_total_cost_consumed + v_allocated_cost;

    v_days := EXTRACT(DAY FROM (p_execution_date - v_lot.acquisition_date));
    IF v_days >= 365 THEN
      v_tax_class := 'LTCG';
      v_has_ltcg := TRUE;
    ELSE
      v_tax_class := 'STCG';
      v_has_stcg := TRUE;
    END IF;

    -- Update lot in DB (E2)
    UPDATE public.portfolio_tax_lots
    SET remaining_quantity = v_new_lot_rem,
        is_exhausted = (v_new_lot_rem = 0),
        updated_at = NOW()
    WHERE id = v_lot.id;

    -- Accumulate allocation
    v_allocations := v_allocations || jsonb_build_object(
      'tax_lot_id', v_lot.id,
      'allocated_quantity', v_allocated_qty,
      'cost_per_share', v_lot.cost_per_share,
      'allocated_cost_basis', v_allocated_cost,
      'holding_period_days', v_days,
      'tax_classification', v_tax_class
    );

    v_remaining_needed := v_remaining_needed - v_allocated_qty;
  END LOOP;

  IF v_remaining_needed > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_LOT_QUANTITY: Available active tax lots cannot cover % shares', p_quantity_sold;
  END IF;

  -- Tax classification aggregation (E20)
  IF v_has_ltcg AND v_has_stcg THEN
    v_overall_tax_class := 'MIXED';
  ELSIF v_has_ltcg THEN
    v_overall_tax_class := 'LTCG';
  ELSE
    v_overall_tax_class := 'STCG';
  END IF;

  -- Realized P&L (E15)
  v_realized_pnl := p_net_proceeds - v_total_cost_consumed;
  IF v_realized_pnl > 0 THEN
    v_gain_type := 'GAIN';
  ELSIF v_realized_pnl < 0 THEN
    v_gain_type := 'LOSS';
  ELSE
    v_gain_type := 'BREAKEVEN';
  END IF;

  -- Update portfolio_positions (E22)
  UPDATE public.portfolio_positions
  SET quantity = quantity - p_quantity_sold,
      total_invested_cost = total_invested_cost - v_total_cost_consumed,
      average_cost_price = CASE WHEN (quantity - p_quantity_sold) > 0 THEN (total_invested_cost - v_total_cost_consumed) / (quantity - p_quantity_sold) ELSE 0 END,
      realized_pnl = COALESCE(realized_pnl, 0) + v_realized_pnl,
      updated_at = NOW()
  WHERE id = v_pos.id;

  -- Insert portfolio_exit_transactions (E15, E17, E19)
  INSERT INTO public.portfolio_exit_transactions (
    user_id, applicant_id, security_id, portfolio_position_id,
    idempotency_key, exit_status, cost_basis_method, execution_source,
    source_record_id, source_timestamp, quantity_sold, execution_price,
    gross_proceeds, total_charges, net_proceeds, cost_basis_consumed,
    realized_pnl, realized_pnl_pct, gain_type, tax_classification,
    tax_rule_version, execution_date, settlement_date, settlement_status,
    payload_hash, metadata
  ) VALUES (
    p_user_id, p_applicant_id, p_security_id, v_pos.id,
    p_idempotency_key, 'EXECUTED', 'FIFO', p_execution_source,
    p_source_record_id, p_source_timestamp, p_quantity_sold, p_execution_price,
    p_quantity_sold * p_execution_price, p_total_charges, p_net_proceeds, v_total_cost_consumed,
    v_realized_pnl,
    CASE WHEN v_total_cost_consumed > 0 THEN ROUND((v_realized_pnl / v_total_cost_consumed) * 100, 4) ELSE 0 END,
    v_gain_type, v_overall_tax_class,
    p_tax_rule_version, p_execution_date, p_settlement_date, 'SETTLEMENT_PENDING',
    p_payload_hash, p_metadata
  ) RETURNING id INTO v_exit_tx_id;

  -- Insert allocations into portfolio_exit_allocations (E7)
  INSERT INTO public.portfolio_exit_allocations (
    exit_transaction_id, tax_lot_id, allocated_quantity, cost_per_share,
    allocated_cost_basis, holding_period_days, tax_classification, tax_rule_version
  )
  SELECT
    v_exit_tx_id,
    (elem->>'tax_lot_id')::UUID,
    (elem->>'allocated_quantity')::NUMERIC,
    (elem->>'cost_per_share')::NUMERIC,
    (elem->>'allocated_cost_basis')::NUMERIC,
    (elem->>'holding_period_days')::INTEGER,
    elem->>'tax_classification',
    p_tax_rule_version
  FROM jsonb_array_elements(v_allocations) AS elem;

  -- Insert charges into portfolio_exit_charges (E12)
  IF p_charges IS NOT NULL AND jsonb_array_length(p_charges) > 0 THEN
    INSERT INTO public.portfolio_exit_charges (
      exit_transaction_id, charge_type, amount, account_id, notes
    )
    SELECT
      v_exit_tx_id,
      elem->>'chargeType',
      (elem->>'amount')::NUMERIC,
      (elem->>'accountId')::UUID,
      elem->>'notes'
    FROM jsonb_array_elements(p_charges) AS elem;
  END IF;

  -- Insert audit event into portfolio_exit_events (E10)
  INSERT INTO public.portfolio_exit_events (
    exit_transaction_id, event_type, actor_id, previous_status, new_status, payload_hash, notes
  ) VALUES (
    v_exit_tx_id, 'EXIT_EXECUTED', p_user_id, NULL, 'EXECUTED', p_payload_hash,
    'Authoritative equity exit executed via atomic PostgreSQL procedure with FOR UPDATE locks'
  );

  RETURN jsonb_build_object(
    'is_duplicate', false,
    'exit_id', v_exit_tx_id,
    'cost_basis_consumed', v_total_cost_consumed,
    'realized_pnl', v_realized_pnl,
    'gain_type', v_gain_type,
    'tax_classification', v_overall_tax_class,
    'allocations', v_allocations
  );
END;
$$;
