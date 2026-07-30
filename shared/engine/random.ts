// seeded 随机数：基于种子可复现。mulberry32 算法。
// 同一 (seed, salt) 组合始终产生同一序列，保证存档可复现。

/** 由种子创建确定性 PRNG 函数 */
export function createRng(seed: number): (salt: number) => number {
  let s = seed >>> 0
  return (salt: number) => {
    // 将 salt 混入状态，保证不同 salt 产出不同值但仍然确定
    s = (s ^ salt) >>> 0
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 在 [min, max] 区间取整数（闭区间） */
export function randInt(rng: (salt: number) => number, salt: number, min: number, max: number): number {
  return Math.floor(rng(salt) * (max - min + 1)) + min
}

/** 返回 0~100 的成功判定：roll < successRate 则成功 */
export function rollCheck(rng: (salt: number) => number, salt: number, successRate: number): { roll: number; success: boolean } {
  const roll = Math.floor(rng(salt) * 100)
  return { roll, success: roll < successRate }
}

/** 钳制到 [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
