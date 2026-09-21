-- ==============================================================================
-- CANDIDATE E: DATABASE HARDENING MIGRATION 35
-- Migration: 20260928000035_candidate_e_database_hardening.sql
-- 
-- Invariants enforced:
-- 1. E10: Database trigger enforcing strictly append-only immutability on portfolio_exit_events
-- 2. E3 & E16: Atomic PostgreSQL function with native SELECT ... FOR UPDATE row locks
--    on portfolio_positions and portfolio_tax_lots, balanced GL journal entries,
--    investment transactions, and structured execution return
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

-- 2. E3 & E16: Authoritative Atomic Exit Execution with FOR UPDATE Locks & GL Posting
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'execute_portfolio_exit_atomic'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE;';
  END LOOP;
END $$;

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
  p_charges JSONB,
  p_inject_failure VARCHAR DEFAULT NULL
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
  v_inv_tx_id UUID;
  v_journal_id UUID;
  v_gross_proceeds NUMERIC := p_quantity_sold * p_execution_price;
  v_realized_pnl NUMERIC;
  v_gross_pnl NUMERIC;
  v_gain_type VARCHAR;
  v_tax_class VARCHAR;
  v_has_ltcg BOOLEAN := FALSE;
  v_has_stcg BOOLEAN := FALSE;
  v_overall_tax_class VARCHAR;
  v_allocations JSONB := '[]'::jsonb;
  v_days INTEGER;
  v_existing RECORD;
  v_acc_1030 UUID;
  v_acc_1110 UUID;
  v_acc_5020 UUID;
  v_acc_4010 UUID;
  v_acc_5010 UUID;
  v_jrn_number VARCHAR;
BEGIN
  -- 1. E14: Database-Authoritative Idempotency Check
  SELECT id, exit_status, quantity_sold, execution_price, gross_proceeds,
         total_charges, net_proceeds, cost_basis_consumed, realized_pnl,
         gain_type, tax_classification, tax_rule_version, investment_transaction_id,
         journal_entry_id, settlement_status
  INTO v_existing
  FROM public.portfolio_exit_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'isDuplicate', true,
      'exitId', v_existing.id,
      'status', v_existing.exit_status,
      'quantitySold', v_existing.quantity_sold::TEXT,
      'executionPrice', v_existing.execution_price::TEXT,
      'grossProceeds', v_existing.gross_proceeds::TEXT,
      'totalCharges', v_existing.total_charges::TEXT,
      'netProceeds', v_existing.net_proceeds::TEXT,
      'costBasisConsumed', v_existing.cost_basis_consumed::TEXT,
      'realizedPnl', v_existing.realized_pnl::TEXT,
      'gainType', v_existing.gain_type,
      'taxClassification', v_existing.tax_classification,
      'taxRuleVersion', v_existing.tax_rule_version,
      'investmentTransactionId', v_existing.investment_transaction_id,
      'journalEntryId', v_existing.journal_entry_id,
      'settlementStatus', v_existing.settlement_status
    );
  END IF;

  -- 2. E3: Authoritative Row-Level Lock on portfolio_positions
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

  -- 3. E3 & E4: Authoritative Row-Level Lock on candidate portfolio_tax_lots with deterministic FIFO ordering
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

    -- E2: Update lot quantity in DB
    UPDATE public.portfolio_tax_lots
    SET remaining_quantity = v_new_lot_rem,
        is_exhausted = (v_new_lot_rem = 0),
        updated_at = NOW()
    WHERE id = v_lot.id;

    -- Accumulate allocation plan
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

  -- E20: Tax classification aggregation
  IF v_has_ltcg AND v_has_stcg THEN
    v_overall_tax_class := 'MIXED';
  ELSIF v_has_ltcg THEN
    v_overall_tax_class := 'LTCG';
  ELSE
    v_overall_tax_class := 'STCG';
  END IF;

  -- E15: Realized P&L Calculation
  v_realized_pnl := p_net_proceeds - v_total_cost_consumed;
  IF v_realized_pnl > 0 THEN
    v_gain_type := 'GAIN';
  ELSIF v_realized_pnl < 0 THEN
    v_gain_type := 'LOSS';
  ELSE
    v_gain_type := 'BREAKEVEN';
  END IF;

  -- 4. E9: General Ledger Journal Posting (Atomic within this transaction)
  SELECT id INTO v_acc_1030 FROM public.financial_accounts WHERE user_id = p_user_id AND account_code = '1030' LIMIT 1;
  SELECT id INTO v_acc_1110 FROM public.financial_accounts WHERE user_id = p_user_id AND account_code = '1110' LIMIT 1;
  SELECT id INTO v_acc_5020 FROM public.financial_accounts WHERE user_id = p_user_id AND account_code = '5020' LIMIT 1;
  SELECT id INTO v_acc_4010 FROM public.financial_accounts WHERE user_id = p_user_id AND account_code = '4010' LIMIT 1;
  SELECT id INTO v_acc_5010 FROM public.financial_accounts WHERE user_id = p_user_id AND account_code = '5010' LIMIT 1;

  IF v_acc_1030 IS NOT NULL AND v_acc_1110 IS NOT NULL AND v_acc_5020 IS NOT NULL AND v_acc_4010 IS NOT NULL AND v_acc_5010 IS NOT NULL THEN
    v_jrn_number := 'JRN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6));
    
    INSERT INTO public.journal_entries (
      user_id, journal_number, idempotency_key, status, journal_type,
      reference_type, transaction_date, narration, metadata
    ) VALUES (
      p_user_id, v_jrn_number, 'journal:exit:' || p_idempotency_key, 'posted', 'security_sale',
      'portfolio_exit', p_execution_date,
      'Equity Exit: ' || p_quantity_sold || ' shares sold @ ₹' || p_execution_price || '; Net=₹' || p_net_proceeds || '; PnL=₹' || v_realized_pnl,
      jsonb_build_object('idempotencyKey', p_idempotency_key, 'quantitySold', p_quantity_sold, 'realizedPnl', v_realized_pnl)
    ) RETURNING id INTO v_journal_id;

    -- Debit 1030 (Broker Receivable for Net Proceeds)
    INSERT INTO public.journal_lines (journal_id, account_id, applicant_id, debit, credit, line_narration)
    VALUES (v_journal_id, v_acc_1030, p_applicant_id, p_net_proceeds, 0, 'Broker clearing receivable');

    -- Debit 5020 (Charges & STT if > 0)
    IF p_total_charges > 0 THEN
      INSERT INTO public.journal_lines (journal_id, account_id, applicant_id, debit, credit, line_narration)
      VALUES (v_journal_id, v_acc_5020, p_applicant_id, p_total_charges, 0, 'Transaction charges and STT');
    END IF;

    -- Credit 1110 (Cost Basis Consumed)
    INSERT INTO public.journal_lines (journal_id, account_id, applicant_id, debit, credit, line_narration)
    VALUES (v_journal_id, v_acc_1110, p_applicant_id, 0, v_total_cost_consumed, 'Cost basis relieved (FIFO)');

    -- Gross Gain / Loss line
    v_gross_pnl := v_gross_proceeds - v_total_cost_consumed;
    IF v_gross_pnl > 0 THEN
      INSERT INTO public.journal_lines (journal_id, account_id, applicant_id, debit, credit, line_narration)
      VALUES (v_journal_id, v_acc_4010, p_applicant_id, 0, v_gross_pnl, 'Realized capital gain');
    ELSIF v_gross_pnl < 0 THEN
      INSERT INTO public.journal_lines (journal_id, account_id, applicant_id, debit, credit, line_narration)
      VALUES (v_journal_id, v_acc_5010, p_applicant_id, ABS(v_gross_pnl), 0, 'Realized capital loss');
    END IF;
  END IF;

  -- 5. Insert investment_transactions record ('secondary_sale')
  INSERT INTO public.investment_transactions (
    user_id, applicant_id, security_id, journal_id, idempotency_key,
    transaction_type, transaction_date, quantity, price_per_share,
    gross_amount, fees, net_amount, notes
  ) VALUES (
    p_user_id, p_applicant_id, p_security_id, v_journal_id, 'invtx:exit:' || p_idempotency_key,
    'secondary_sale', p_execution_date, ROUND(p_quantity_sold), p_execution_price,
    v_gross_proceeds, p_total_charges, p_net_proceeds,
    'Secondary Exit: ' || p_quantity_sold || ' shares sold @ ₹' || p_execution_price
  ) RETURNING id INTO v_inv_tx_id;

  -- 6. E22: Update portfolio_positions
  UPDATE public.portfolio_positions
  SET quantity = quantity - p_quantity_sold,
      total_invested_cost = total_invested_cost - v_total_cost_consumed,
      average_cost_price = CASE WHEN (quantity - p_quantity_sold) > 0 THEN (total_invested_cost - v_total_cost_consumed) / (quantity - p_quantity_sold) ELSE 0 END,
      realized_pnl = COALESCE(realized_pnl, 0) + v_realized_pnl,
      updated_at = NOW()
  WHERE id = v_pos.id;

  -- 7. Insert portfolio_exit_transactions
  INSERT INTO public.portfolio_exit_transactions (
    user_id, applicant_id, security_id, portfolio_position_id,
    idempotency_key, exit_status, cost_basis_method, execution_source,
    source_record_id, source_timestamp, quantity_sold, execution_price,
    gross_proceeds, total_charges, net_proceeds, cost_basis_consumed,
    realized_pnl, realized_pnl_pct, gain_type, tax_classification,
    tax_rule_version, investment_transaction_id, journal_entry_id,
    execution_date, settlement_date, settlement_status,
    payload_hash, metadata
  ) VALUES (
    p_user_id, p_applicant_id, p_security_id, v_pos.id,
    p_idempotency_key, 'EXECUTED', 'FIFO', p_execution_source,
    p_source_record_id, p_source_timestamp, p_quantity_sold, p_execution_price,
    v_gross_proceeds, p_total_charges, p_net_proceeds, v_total_cost_consumed,
    v_realized_pnl,
    CASE WHEN v_total_cost_consumed > 0 THEN ROUND((v_realized_pnl / v_total_cost_consumed) * 100, 4) ELSE 0 END,
    v_gain_type, v_overall_tax_class,
    p_tax_rule_version, v_inv_tx_id, v_journal_id,
    p_execution_date, p_settlement_date, 'SETTLEMENT_PENDING',
    p_payload_hash, p_metadata
  ) RETURNING id INTO v_exit_tx_id;

  -- 8. Insert allocations (E7)
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

  -- 9. Insert charges (E12)
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

  -- 10. Insert audit event (E10)
  INSERT INTO public.portfolio_exit_events (
    exit_transaction_id, event_type, actor_id, previous_status, new_status, payload_hash, metadata
  ) VALUES (
    v_exit_tx_id, 'EXIT_EXECUTED', p_user_id, NULL, 'EXECUTED', p_payload_hash,
    jsonb_build_object('notes', 'Authoritative equity exit executed via atomic PostgreSQL procedure with FOR UPDATE locks')
  );

  -- 11. E16: Failure Injection Hook for Automated Atomicity Testing
  IF p_inject_failure IS NOT NULL THEN
    RAISE EXCEPTION 'INJECTED_FAILURE_FOR_TEST: %', p_inject_failure;
  END IF;

  -- 12. Return structured execution result
  RETURN jsonb_build_object(
    'isDuplicate', false,
    'exitId', v_exit_tx_id,
    'status', 'EXECUTED',
    'quantitySold', p_quantity_sold::TEXT,
    'executionPrice', p_execution_price::TEXT,
    'grossProceeds', v_gross_proceeds::TEXT,
    'totalCharges', p_total_charges::TEXT,
    'netProceeds', p_net_proceeds::TEXT,
    'costBasisConsumed', v_total_cost_consumed::TEXT,
    'realizedPnl', v_realized_pnl::TEXT,
    'gainType', v_gain_type,
    'taxClassification', v_overall_tax_class,
    'taxRuleVersion', p_tax_rule_version,
    'investmentTransactionId', v_inv_tx_id,
    'journalEntryId', v_journal_id,
    'settlementStatus', 'SETTLEMENT_PENDING',
    'allocations', v_allocations
  );
END;
$$;
