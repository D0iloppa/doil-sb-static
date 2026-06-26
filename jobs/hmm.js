// Hidden Markov Model — Baum-Welch 학습 + Viterbi 디코딩
// 3 hidden states: 0=Bear, 1=Neutral, 2=Bull
// Observable: 이산화된 일일 수익률 (5 bins)

const N_STATES = 3;   // Bear / Neutral / Bull
const N_OBS = 5;      // 이산화 bins

// 수익률 → 관측값 이산화 (5개 구간)
// < -2%  → 0  (극단 하락)
// -2~-0.5% → 1
// -0.5~+0.5% → 2 (횡보)
// 0.5~+2% → 3
// > 2%   → 4  (극단 상승)
function discretize(ret) {
  if (ret < -0.02) return 0;
  if (ret < -0.005) return 1;
  if (ret < 0.005) return 2;
  if (ret < 0.02) return 3;
  return 4;
}

// 로그 합 (수치 안정성)
function logSumExp(logA, logB) {
  if (logA === -Infinity) return logB;
  if (logB === -Infinity) return logA;
  const maxVal = Math.max(logA, logB);
  return maxVal + Math.log(Math.exp(logA - maxVal) + Math.exp(logB - maxVal));
}

// 초기 파라미터 (직관적 설정 — Baum-Welch가 수렴시킴)
function initParams() {
  // 전이 행렬: 레짐은 지속성 높음
  const A = [
    [0.92, 0.06, 0.02],  // Bear → Bear/Neutral/Bull
    [0.05, 0.90, 0.05],  // Neutral
    [0.02, 0.06, 0.92],  // Bull
  ];
  // 방출 확률: 상태별 수익률 분포
  const B = [
    [0.40, 0.30, 0.20, 0.07, 0.03],  // Bear: 하락 편향
    [0.10, 0.20, 0.40, 0.20, 0.10],  // Neutral: 균등
    [0.03, 0.07, 0.20, 0.30, 0.40],  // Bull: 상승 편향
  ];
  const pi = [0.33, 0.34, 0.33];
  return { A, B, pi };
}

// Forward 알고리즘 (log-scale)
function forward(obs, A, B, pi) {
  const T = obs.length;
  const alpha = Array.from({ length: T }, () => new Array(N_STATES).fill(-Infinity));
  for (let s = 0; s < N_STATES; s++) {
    alpha[0][s] = Math.log(pi[s]) + Math.log(B[s][obs[0]] || 1e-300);
  }
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < N_STATES; s++) {
      let sum = -Infinity;
      for (let p = 0; p < N_STATES; p++) {
        sum = logSumExp(sum, alpha[t-1][p] + Math.log(A[p][s] || 1e-300));
      }
      alpha[t][s] = sum + Math.log(B[s][obs[t]] || 1e-300);
    }
  }
  return alpha;
}

// Backward 알고리즘 (log-scale)
function backward(obs, A, B) {
  const T = obs.length;
  const beta = Array.from({ length: T }, () => new Array(N_STATES).fill(-Infinity));
  for (let s = 0; s < N_STATES; s++) beta[T-1][s] = 0; // log(1)
  for (let t = T - 2; t >= 0; t--) {
    for (let s = 0; s < N_STATES; s++) {
      let sum = -Infinity;
      for (let ns = 0; ns < N_STATES; ns++) {
        sum = logSumExp(sum,
          Math.log(A[s][ns] || 1e-300) + Math.log(B[ns][obs[t+1]] || 1e-300) + beta[t+1][ns]
        );
      }
      beta[t][s] = sum;
    }
  }
  return beta;
}

// Baum-Welch EM — maxIter 회 반복
function baumWelch(obs, maxIter = 30) {
  let { A, B, pi } = initParams();

  for (let iter = 0; iter < maxIter; iter++) {
    const alpha = forward(obs, A, B, pi);
    const beta = backward(obs, A, B);
    const T = obs.length;

    // gamma[t][s] = P(state=s at t | obs)
    const gamma = Array.from({ length: T }, (_, t) => {
      const raw = alpha[t].map((a, s) => a + beta[t][s]);
      const logZ = raw.reduce(logSumExp, -Infinity);
      return raw.map(v => Math.exp(v - logZ));
    });

    // xi[t][s][ns] = P(state=s at t, state=ns at t+1 | obs)
    const newA = Array.from({ length: N_STATES }, () => new Array(N_STATES).fill(0));
    const newADenom = new Array(N_STATES).fill(0);
    for (let t = 0; t < T - 1; t++) {
      const logXi = Array.from({ length: N_STATES }, (_, s) =>
        Array.from({ length: N_STATES }, (__, ns) =>
          alpha[t][s] + Math.log(A[s][ns] || 1e-300) +
          Math.log(B[ns][obs[t+1]] || 1e-300) + beta[t+1][ns]
        )
      );
      const flat = logXi.flat();
      const logZ = flat.reduce(logSumExp, -Infinity);
      for (let s = 0; s < N_STATES; s++) {
        for (let ns = 0; ns < N_STATES; ns++) {
          const xi = Math.exp(logXi[s][ns] - logZ);
          newA[s][ns] += xi;
          newADenom[s] += xi;
        }
      }
    }

    const newB = Array.from({ length: N_STATES }, () => new Array(N_OBS).fill(0));
    const newBDenom = new Array(N_STATES).fill(0);
    for (let t = 0; t < T; t++) {
      for (let s = 0; s < N_STATES; s++) {
        newB[s][obs[t]] += gamma[t][s];
        newBDenom[s] += gamma[t][s];
      }
    }

    const newPi = gamma[0].slice();

    // 정규화
    for (let s = 0; s < N_STATES; s++) {
      for (let ns = 0; ns < N_STATES; ns++) {
        A[s][ns] = (newA[s][ns] + 1e-10) / (newADenom[s] + N_STATES * 1e-10);
      }
      for (let o = 0; o < N_OBS; o++) {
        B[s][o] = (newB[s][o] + 1e-10) / (newBDenom[s] + N_OBS * 1e-10);
      }
    }
    const piSum = newPi.reduce((a, b) => a + b, 0);
    pi = newPi.map(v => v / piSum);
  }

  // 레짐 라벨 정렬: B 행렬의 기댓값 기준으로 Bear<Neutral<Bull 순서 보장
  const stateExpected = B.map((row, s) =>
    row.reduce((sum, prob, o) => sum + prob * (o - 2), 0) // o-2: [-2,-1,0,1,2]
  );
  // 인덱스 정렬 (오름차순 = Bear→Bull)
  const sorted = stateExpected.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const remap = new Array(N_STATES);
  sorted.forEach(([, origIdx], newIdx) => { remap[origIdx] = newIdx; });

  return { A, B, pi, remap };
}

// Viterbi 디코딩 — 최적 상태 시퀀스
function viterbi(obs, A, B, pi) {
  const T = obs.length;
  const delta = Array.from({ length: T }, () => new Array(N_STATES).fill(-Infinity));
  const psi = Array.from({ length: T }, () => new Array(N_STATES).fill(0));

  for (let s = 0; s < N_STATES; s++) {
    delta[0][s] = Math.log(pi[s] || 1e-300) + Math.log(B[s][obs[0]] || 1e-300);
  }
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < N_STATES; s++) {
      let best = -Infinity, bestPrev = 0;
      for (let p = 0; p < N_STATES; p++) {
        const v = delta[t-1][p] + Math.log(A[p][s] || 1e-300);
        if (v > best) { best = v; bestPrev = p; }
      }
      delta[t][s] = best + Math.log(B[s][obs[t]] || 1e-300);
      psi[t][s] = bestPrev;
    }
  }

  // 역추적
  const path = new Array(T);
  path[T-1] = delta[T-1].indexOf(Math.max(...delta[T-1]));
  for (let t = T - 2; t >= 0; t--) {
    path[t] = psi[t+1][path[t+1]];
  }
  return { path, delta };
}

// 후방 확률 (각 시점의 state 확률)
function posteriorProbs(obs, A, B, pi) {
  const alpha = forward(obs, A, B, pi);
  const beta = backward(obs, A, B);
  const T = obs.length;
  return Array.from({ length: T }, (_, t) => {
    const raw = alpha[t].map((a, s) => a + beta[t][s]);
    const logZ = raw.reduce(logSumExp, -Infinity);
    return raw.map(v => Math.exp(v - logZ));
  });
}

// ─── 메인 API ────────────────────────────────────────────────

// returns: [{date, state(0-2), prob_bull, prob_neutral, prob_bear}]
function runHMM(priceRows) {
  if (priceRows.length < 60) return [];

  const rets = [];
  for (let i = 1; i < priceRows.length; i++) {
    const prev = parseFloat(priceRows[i-1].adj_close);
    const curr = parseFloat(priceRows[i].adj_close);
    rets.push((curr - prev) / prev);
  }
  const obs = rets.map(discretize);

  const { A, B, pi, remap } = baumWelch(obs, 30);
  const probs = posteriorProbs(obs, A, B, pi);

  // remap: 원래 HMM state → Bear(0)/Neutral(1)/Bull(2)
  const STATE_NAMES = ['bear', 'neutral', 'bull'];

  return probs.map((p, i) => {
    const remapped = new Array(N_STATES).fill(0);
    p.forEach((prob, origState) => { remapped[remap[origState]] += prob; });
    const state = remapped.indexOf(Math.max(...remapped));
    return {
      date: (priceRows[i+1].date instanceof Date
        ? priceRows[i+1].date.toISOString()
        : String(priceRows[i+1].date)).slice(0, 10),
      state,        // 0=Bear, 1=Neutral, 2=Bull
      prob_bear: +remapped[0].toFixed(4),
      prob_neutral: +remapped[1].toFixed(4),
      prob_bull: +remapped[2].toFixed(4),
    };
  });
}

module.exports = { runHMM, discretize, baumWelch, viterbi };
