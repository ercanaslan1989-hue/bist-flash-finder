// ============================================================================
// GBDT — a pure-TypeScript, deterministic gradient boosted decision tree
// learner (second-order / Newton boosting, à la XGBoost & LightGBM).
//
// Why hand-rolled? The app runs 100% in the browser (and any server code runs
// on Cloudflare Workers). Native XGBoost/LightGBM need OS binaries and cannot
// load in either environment. This implementation reproduces their core maths:
//
//   • Histogram-based split finding over quantile-binned features (fast).
//   • Second-order leaf weights  w = -G / (H + lambda),  scaled by learningRate.
//   • Split gain = ½[ GL²/(HL+λ) + GR²/(HR+λ) − G²/(H+λ) ] − gamma.
//   • Native missing-value handling with a learned per-node default direction.
//   • Two growth policies:
//       - "level"  → depth-bounded (XGBoost-style, level/depth-wise).
//       - "leaf"   → best-first, leaf-count-bounded (LightGBM-style).
//   • Seeded RNG for row/feature subsampling → fully reproducible.
//
// Everything is deterministic: same data + same seed ⇒ identical model.
// ============================================================================

import type { ModelHyperParams, TreeNode } from "./types";

export type GrowthPolicy = "level" | "leaf";

/** Deterministic PRNG (mulberry32) — reproducible subsampling. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** MISSING bin sentinel. */
export const MISSING = -1;

/**
 * Compute ascending quantile bin edges for one feature column. Missing (null)
 * values are ignored. Returns up to `maxBins - 1` unique interior edges; a
 * value maps to bin index = count of edges it is strictly greater than.
 */
export function computeBinEdges(values: (number | null)[], maxBins: number): number[] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return [];
  nums.sort((a, b) => a - b);
  const uniq = Array.from(new Set(nums));
  if (uniq.length <= 1) return [];
  const nEdges = Math.min(maxBins - 1, uniq.length - 1);
  const edges: number[] = [];
  for (let k = 1; k <= nEdges; k++) {
    const q = k / (nEdges + 1);
    const pos = q * (nums.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const val = lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (pos - lo);
    edges.push(val);
  }
  // Deduplicate to keep bins meaningful.
  return Array.from(new Set(edges)).sort((a, b) => a - b);
}

/** Map a raw value to a bin index given ascending edges. null → MISSING. */
export function toBin(value: number | null, edges: number[]): number {
  if (value == null || !Number.isFinite(value)) return MISSING;
  // Bin = number of edges strictly less than value (binary search).
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface Candidate {
  indices: number[];
  depth: number;
  split: BestSplit | null;
  /** Set once materialised into the tree, so children can attach. */
  attach: (node: TreeNode) => void;
}

interface BestSplit {
  gain: number;
  feature: number;
  threshold: number; // go left when bin <= threshold
  missingLeft: boolean;
  left: number[];
  right: number[];
  leftWeight: number;
  rightWeight: number;
}

/** Training inputs for a single tree. */
interface TreeContext {
  binned: Int16Array; // [n * nFeatures]
  nFeatures: number;
  nBins: number[]; // bins per feature (edges.length + 1)
  grad: Float64Array;
  hess: Float64Array;
  params: ModelHyperParams;
  featureSubset: number[];
  /** Accumulates total split gain per feature (importance). */
  gainByFeature: Float64Array;
}

const leafWeight = (g: number, h: number, lambda: number): number => -g / (h + lambda);

function evalSplit(indices: number[], ctx: TreeContext): BestSplit | null {
  const { binned, nFeatures, nBins, grad, hess, params, featureSubset } = ctx;
  let G = 0;
  let H = 0;
  for (const idx of indices) {
    G += grad[idx];
    H += hess[idx];
  }
  const parentScore = (G * G) / (H + params.lambda);

  let best: BestSplit | null = null;

  for (const f of featureSubset) {
    const bins = nBins[f];
    const gHist = new Float64Array(bins);
    const hHist = new Float64Array(bins);
    let gMiss = 0;
    let hMiss = 0;
    for (const idx of indices) {
      const b = binned[idx * nFeatures + f];
      if (b === MISSING) {
        gMiss += grad[idx];
        hMiss += hess[idx];
      } else {
        gHist[b] += grad[idx];
        hHist[b] += hess[idx];
      }
    }

    // Sweep thresholds left→right; try sending missing to each side.
    let gL = 0;
    let hL = 0;
    for (let t = 0; t < bins - 1; t++) {
      gL += gHist[t];
      hL += hHist[t];
      for (const missLeft of [true, false] as const) {
        const gLeft = gL + (missLeft ? gMiss : 0);
        const hLeft = hL + (missLeft ? hMiss : 0);
        const gRight = G - gLeft;
        const hRight = H - hLeft;
        if (hLeft < params.minChildWeight || hRight < params.minChildWeight) continue;
        const gain =
          0.5 *
            ((gLeft * gLeft) / (hLeft + params.lambda) +
              (gRight * gRight) / (hRight + params.lambda) -
              parentScore) -
          params.gamma;
        if (gain > 0 && (!best || gain > best.gain)) {
          best = {
            gain,
            feature: f,
            threshold: t,
            missingLeft: missLeft,
            left: [],
            right: [],
            leftWeight: leafWeight(gLeft, hLeft, params.lambda),
            rightWeight: leafWeight(gRight, hRight, params.lambda),
          };
        }
      }
    }
  }

  if (!best) return null;
  // Partition indices for the chosen split.
  const left: number[] = [];
  const right: number[] = [];
  for (const idx of indices) {
    const b = binned[idx * nFeatures + best.feature];
    const goLeft = b === MISSING ? best.missingLeft : b <= best.threshold;
    if (goLeft) left.push(idx);
    else right.push(idx);
  }
  best.left = left;
  best.right = right;
  return best;
}

function makeLeaf(indices: number[], ctx: TreeContext): TreeNode {
  let G = 0;
  let H = 0;
  for (const idx of indices) {
    G += ctx.grad[idx];
    H += ctx.hess[idx];
  }
  return { leaf: ctx.params.learningRate * leafWeight(G, H, ctx.params.lambda) };
}

/** Build a single tree with the given growth policy. */
export function buildTree(
  rootIndices: number[],
  ctx: TreeContext,
  growth: GrowthPolicy,
): TreeNode {
  const { params } = ctx;
  let root: TreeNode = { leaf: 0 };
  const open: Candidate[] = [];

  const mkCandidate = (indices: number[], depth: number, attach: (n: TreeNode) => void) => {
    const split = depth >= params.maxDepth ? null : evalSplit(indices, ctx);
    open.push({ indices, depth, split, attach });
  };

  mkCandidate(rootIndices, 0, (n) => {
    root = n;
  });

  let leafCount = 1;
  while (open.length > 0) {
    // Selection order: best-first for leaf-wise, FIFO (level-ish) otherwise.
    let pick = 0;
    if (growth === "leaf") {
      let bestGain = -Infinity;
      for (let k = 0; k < open.length; k++) {
        const g = open[k].split?.gain ?? -Infinity;
        if (g > bestGain) {
          bestGain = g;
          pick = k;
        }
      }
    }
    const c = open.splice(pick, 1)[0];

    const canSplit =
      c.split != null && c.depth < params.maxDepth && leafCount < params.maxLeaves;
    if (!canSplit) {
      c.attach(makeLeaf(c.indices, ctx));
      continue;
    }

    const s = c.split!;
    ctx.gainByFeature[s.feature] += s.gain;
    const node: TreeNode = { f: s.feature, t: s.threshold, ml: s.missingLeft };
    c.attach(node);
    leafCount += 1; // one split adds one net leaf

    mkCandidate(s.left, c.depth + 1, (n) => {
      node.l = n;
    });
    mkCandidate(s.right, c.depth + 1, (n) => {
      node.r = n;
    });
  }

  return root;
}

export interface GBDTResult {
  baseScore: number;
  trees: TreeNode[];
  /** Raw total split gain per feature index. */
  gainByFeature: number[];
}

/**
 * Train a binary-logistic GBDT.
 *
 * @param binned  Int16Array of shape [n * nFeatures] with bin indices / MISSING.
 * @param labels  0/1 targets, length n.
 * @param nBins   bins-per-feature (edges.length + 1).
 * @param params  hyper-parameters (seed controls subsampling).
 * @param growth  growth policy — "level" (XGBoost) or "leaf" (LightGBM).
 */
export function trainGBDT(
  binned: Int16Array,
  labels: Uint8Array,
  nFeatures: number,
  nBins: number[],
  params: ModelHyperParams,
  growth: GrowthPolicy,
): GBDTResult {
  const n = labels.length;
  const rand = mulberry32(params.seed);

  // Base score = log-odds of the positive base rate.
  let pos = 0;
  for (let i = 0; i < n; i++) pos += labels[i];
  const p0 = Math.min(0.999, Math.max(0.001, pos / Math.max(1, n)));
  const baseScore = Math.log(p0 / (1 - p0));

  const pred = new Float64Array(n).fill(baseScore);
  const grad = new Float64Array(n);
  const hess = new Float64Array(n);
  const gainByFeature = new Float64Array(nFeatures);

  const trees: TreeNode[] = [];
  const allFeatures = Array.from({ length: nFeatures }, (_, i) => i);

  for (let t = 0; t < params.nTrees; t++) {
    // First/second order gradients of logistic loss.
    for (let i = 0; i < n; i++) {
      const p = sigmoid(pred[i]);
      grad[i] = p - labels[i];
      hess[i] = Math.max(p * (1 - p), 1e-6);
    }

    // Deterministic row subsample.
    let rows: number[];
    if (params.subsample >= 1) {
      rows = Array.from({ length: n }, (_, i) => i);
    } else {
      rows = [];
      for (let i = 0; i < n; i++) if (rand() < params.subsample) rows.push(i);
      if (rows.length === 0) rows = Array.from({ length: n }, (_, i) => i);
    }

    // Deterministic feature subsample.
    let featureSubset: number[];
    if (params.colsample >= 1) {
      featureSubset = allFeatures;
    } else {
      featureSubset = allFeatures.filter(() => rand() < params.colsample);
      if (featureSubset.length === 0) featureSubset = allFeatures;
    }

    const ctx: TreeContext = {
      binned,
      nFeatures,
      nBins,
      grad,
      hess,
      params,
      featureSubset,
      gainByFeature,
    };

    const tree = buildTree(rows, ctx, growth);
    trees.push(tree);

    // Update predictions over ALL rows (not just subsample).
    for (let i = 0; i < n; i++) pred[i] += evalTree(tree, binned, i, nFeatures);
  }

  return { baseScore, trees, gainByFeature: Array.from(gainByFeature) };
}

/** Evaluate one tree for sample `i` in the binned matrix. */
export function evalTree(
  node: TreeNode,
  binned: Int16Array,
  i: number,
  nFeatures: number,
): number {
  let cur: TreeNode = node;
  while (cur.leaf === undefined) {
    const b = binned[i * nFeatures + cur.f!];
    const goLeft = b === MISSING ? cur.ml! : b <= cur.t!;
    cur = (goLeft ? cur.l : cur.r) as TreeNode;
  }
  return cur.leaf;
}

/** Evaluate one tree for a single pre-binned row (used at inference). */
export function evalTreeRow(node: TreeNode, row: Int16Array): number {
  let cur: TreeNode = node;
  while (cur.leaf === undefined) {
    const b = row[cur.f!];
    const goLeft = b === MISSING ? cur.ml! : b <= cur.t!;
    cur = (goLeft ? cur.l : cur.r) as TreeNode;
  }
  return cur.leaf;
}

export { sigmoid };
