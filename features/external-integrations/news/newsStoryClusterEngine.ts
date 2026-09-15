/**
 * features/external-integrations/news/newsStoryClusterEngine.ts
 *
 * Phase 9 Stage 3E: Story Clustering & Provenance Preservation Engine.
 *
 * Invariants:
 * 1. Groups syndicated wire reports (e.g. PTI wire carried by 5 outlets).
 * 2. Deduplicates presentation in UI while strictly preserving every raw observation, publisher attribution, and source timestamp.
 * 3. Uses Jaccard token overlap on normalized headlines + 24-hour time window.
 */

import { StoryClusterResult } from './newsTypes';
import crypto from 'crypto';

export interface ExistingStoryItem {
  id: string;
  headline: string;
  publishedAt: string;
  storyClusterId: string;
  publisherId: string;
}

export class NewsStoryClusterEngine {
  public static readonly SIMILARITY_THRESHOLD = 0.65;
  public static readonly TIME_WINDOW_HOURS = 24.0;

  /**
   * Evaluates if an incoming headline belongs to an existing story cluster or creates a new one.
   */
  public clusterStory(params: {
    headline: string;
    publishedAt: string;
    existingStories: ExistingStoryItem[];
  }): StoryClusterResult {
    const { headline, publishedAt, existingStories } = params;
    const incomingEpoch = new Date(publishedAt).getTime();
    const incomingTokens = this.tokenize(headline);

    for (const existing of existingStories) {
      const existingEpoch = new Date(existing.publishedAt).getTime();
      const diffHours = Math.abs(incomingEpoch - existingEpoch) / (1000 * 60 * 60);

      if (diffHours <= NewsStoryClusterEngine.TIME_WINDOW_HOURS) {
        const existingTokens = this.tokenize(existing.headline);
        const similarity = this.calculateJaccardSimilarity(incomingTokens, existingTokens);

        if (similarity >= NewsStoryClusterEngine.SIMILARITY_THRESHOLD) {
          // Belongs to existing story cluster
          const matchingClusterItems = existingStories.filter(
            (s) => s.storyClusterId === existing.storyClusterId
          );

          return {
            storyClusterId: existing.storyClusterId,
            canonicalStoryId: existing.id, // Primary report in cluster
            isNewCluster: false,
            clusterSize: matchingClusterItems.length + 1,
          };
        }
      }
    }

    // New distinct story cluster
    const newClusterId = crypto.randomUUID();
    const tempCanonicalId = crypto.randomUUID();

    return {
      storyClusterId: newClusterId,
      canonicalStoryId: tempCanonicalId,
      isNewCluster: true,
      clusterSize: 1,
    };
  }

  private tokenize(text: string): Set<string> {
    const clean = text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .trim();

    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of', 'ipo']);
    const tokens = clean.split(/\s+/).filter((t) => t.length > 2 && !stopWords.has(t));
    return new Set(tokens);
  }

  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

export const newsStoryClusterEngine = new NewsStoryClusterEngine();
