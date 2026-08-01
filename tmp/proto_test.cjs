"use strict";

// shared/engine/random.ts
function createRng(seed) {
  let s = seed >>> 0;
  return (salt) => {
    s = (s ^ salt) >>> 0;
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randInt(rng, salt, min, max) {
  return Math.floor(rng(salt) * (max - min + 1)) + min;
}
function rollCheck(rng, salt, successRate) {
  const roll = Math.floor(rng(salt) * 100);
  return { roll, success: roll < successRate };
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// shared/engine/metrics.ts
var INITIAL_METRICS = {
  US: { publicSupport: 60, intelPoints: 10, oppositionPressure: 30, colonyUnrest: 0 },
  UK: { publicSupport: 55, intelPoints: 10, oppositionPressure: 45, colonyUnrest: 30 },
  SU: { publicSupport: 75, intelPoints: 12, oppositionPressure: 10, colonyUnrest: 0 }
};
function createInitialState(seed) {
  return {
    seed,
    session: 1,
    phase: "TOPIC",
    metrics: structuredClone(INITIAL_METRICS),
    intlOpinion: 20,
    rooseveltHealth: 50,
    roosevelt: {
      status: "STABLE",
      vigorPoints: 10,
      trumanSucceeded: false,
      bulletinDelivered: false
    },
    medicalBulletins: [],
    sovietJammerActive: false,
    stalinArchive: {
      status: "DORMANT",
      triggered: false,
      invoked: false,
      sovietCredibility: 80,
      backlashTurns: 0
    },
    polandUprising: {
      status: "DORMANT",
      phase: "DORMANT",
      polandDiscussedSessions: 0,
      westernIntervened: false,
      sovietConceded: false
    },
    ukElection: {
      status: "ACTIVE",
      countdown: 7,
      laborPolling: 35,
      hawkishActions: 0,
      softActions: 0,
      churchillRetired: false,
      churchillAway: false
    },
    petitions: {
      pending: [],
      history: [],
      consecutiveColonyIgnored: 0,
      colonyUprisingTriggered: false
    },
    protocols: [],
    achievedGoals: { US: [], UK: [], SU: [] },
    settlement: null,
    events: [],
    logs: [
      {
        id: "init",
        session: 1,
        phase: "TOPIC",
        text: "1945\u5E742\u67084\u65E5\uFF0C\u514B\u91CC\u7C73\u4E9A\u534A\u5C9B\u5229\u74E6\u5B63\u4E9A\u5BAB\u3002\u4E09\u5DE8\u5934\u62B5\u8FBE\uFF0C\u96C5\u5C14\u5854\u4F1A\u8BAE\u5F00\u5E55\u3002\u7A97\u5916\u9ED1\u6D77\u6D6A\u6D8C\uFF0C\u5BAB\u5185\u70DB\u706B\u6447\u66F3\u2014\u2014\u5386\u53F2\u7684\u6307\u9488\u5728\u6B64\u505C\u987F\u3002",
        kind: "info"
      }
    ],
    actionCounter: 0
  };
}
var METRIC_BOUNDS = {
  publicSupport: [0, 100],
  intelPoints: [0, 30],
  oppositionPressure: [0, 100],
  colonyUnrest: [0, 100],
  intlOpinion: [0, 100],
  rooseveltHealth: [0, 100]
};
function applyDeltas(state, deltas) {
  const next = {
    ...state,
    metrics: {
      US: { ...state.metrics.US },
      UK: { ...state.metrics.UK },
      SU: { ...state.metrics.SU }
    }
  };
  for (const d of deltas) {
    const [lo, hi] = METRIC_BOUNDS[d.key];
    if (d.key === "intlOpinion") {
      next.intlOpinion = clamp(next.intlOpinion + d.delta, lo, hi);
    } else if (d.key === "rooseveltHealth") {
      next.rooseveltHealth = clamp(next.rooseveltHealth + d.delta, lo, hi);
    } else {
      const m = next.metrics[d.nation];
      const k = d.key;
      m[k] = clamp(m[k] + d.delta, lo, hi);
    }
  }
  return next;
}
function maxRadicalness(oppositionPressure) {
  return 100 - Math.max(0, oppositionPressure - 50) * 2;
}

// shared/engine/military.ts
var NATION_NAME = { US: "\u7F8E\u519B", UK: "\u82F1\u519B", SU: "\u82CF\u519B" };
function resolveMilitaryOrder(order, commanderSkill, seed, salt) {
  const rng = createRng(seed);
  const enemyResistance = randInt(rng, salt, 10, 30);
  const logisticsPenalty = order.force > 6 ? (order.force - 6) * 4 : 0;
  const baseSuccess = 50 + order.force * 3 + commanderSkill * 2 - enemyResistance - logisticsPenalty;
  const successRate = clamp(baseSuccess, 5, 95);
  const { roll, success } = rollCheck(rng, salt + 1, successRate);
  const deltas = [];
  let narrative = "";
  switch (order.type) {
    case "OFFENSIVE":
      if (success) {
        deltas.push({ nation: order.nation, key: "publicSupport", delta: 4, reason: "\u8FDB\u653B\u5F97\u624B\uFF0C\u58EB\u6C14\u632F\u594B" });
        deltas.push({ nation: order.nation, key: "intlOpinion", delta: 3, reason: "\u8FDB\u653B\u884C\u52A8\u5F15\u53D1\u56FD\u9645\u5173\u6CE8" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u5411 ${order.target} \u53D1\u8D77\u653B\u52BF\uFF0C\u65D7\u5F00\u5F97\u80DC\uFF0C\u90E8\u961F\u5DF2\u63A8\u8FDB\u81F3\u9884\u5B9A\u9632\u7EBF\u3002`;
      } else {
        const loss = order.force * 10;
        deltas.push({ nation: order.nation, key: "publicSupport", delta: -6, reason: "\u8FDB\u653B\u53D7\u963B\uFF0C\u5175\u529B\u635F\u5931" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u5BF9 ${order.target} \u7684\u8FDB\u653B\u53D7\u632B\uFF0C\u654C\u519B\u8D1F\u9685\u987D\u6297\uFF0C\u6211\u519B\u6298\u635F\u7EA6 ${loss}%\u3002`;
      }
      break;
    case "DEFENSIVE":
      if (success) {
        deltas.push({ nation: order.nation, key: "oppositionPressure", delta: -3, reason: "\u9632\u7EBF\u7A33\u56FA\uFF0C\u56FD\u5185\u5B89\u5FC3" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u4E8E ${order.target} \u4E00\u7EBF\u636E\u5B88\uFF0C\u654C\u519B\u6570\u6B21\u51B2\u51FB\u7686\u88AB\u51FB\u9000\uFF0C\u9632\u7EBF\u56FA\u82E5\u78D0\u77F3\u3002`;
      } else {
        deltas.push({ nation: order.nation, key: "colonyUnrest", delta: 4, reason: "\u9632\u7EBF\u52A8\u6447\u5F15\u53D1\u4E0D\u5B89" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u5728 ${order.target} \u7684\u9632\u7EBF\u906D\u654C\u519B\u7A81\u7834\uFF0C\u5C40\u52BF\u5C8C\u5C8C\u53EF\u5371\u3002`;
      }
      break;
    case "WITHDRAW":
      if (success) {
        deltas.push({ nation: order.nation, key: "intlOpinion", delta: -2, reason: "\u6709\u5E8F\u64A4\u9000" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u81EA ${order.target} \u4E95\u7136\u64A4\u9000\uFF0C\u4E3B\u529B\u5F97\u4EE5\u4FDD\u5168\uFF0C\u91CD\u6574\u65D7\u9F13\u3002`;
      } else {
        deltas.push({ nation: order.nation, key: "publicSupport", delta: -8, reason: "\u6DF7\u4E71\u64A4\u9000\uFF0C\u58EB\u6C14\u53D7\u632B" });
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u81EA ${order.target} \u7684\u64A4\u9000\u6F14\u53D8\u4E3A\u6E83\u9000\uFF0C\u8F8E\u91CD\u5C3D\u5931\uFF0C\u58EB\u6C14\u5927\u632B\u3002`;
      }
      break;
    case "REDEPLOY":
      if (success) {
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u5B8C\u6210\u5411 ${order.target} \u7684\u5175\u529B\u8C03\u52A8\uFF0C\u4E0B\u4E00\u9636\u6BB5\u4F5C\u6218\u6001\u52BF\u5C06\u83B7\u589E\u63F4\u3002`;
      } else {
        narrative = `\u524D\u7EBF\u6218\u62A5\uFF1A${NATION_NAME[order.nation]}\u8C03\u5F80 ${order.target} \u7684\u90E8\u961F\u906D\u654C\u7A7A\u4E2D\u906E\u65AD\uFF0C\u8C03\u5EA6\u5EF6\u8BEF\u3002`;
      }
      break;
  }
  return {
    order,
    success,
    successRate,
    roll,
    deltas,
    narrative: `${narrative}\u3014\u63A8\u6F14\u80DC\u7B97 ${successRate}%\uFF0C\u63B7\u9AB0 ${roll}\u3015`
  };
}

// shared/engine/wiretap.ts
var NATION_NAME2 = { US: "\u7F8E\u65B9", UK: "\u82F1\u65B9", SU: "\u82CF\u65B9" };
var COUNTER_INTEL = { US: 6, UK: 7, SU: 8 };
var VENUE_INTEL = {
  V1: { partial: "", full: "" },
  // 会场一禁听，不会走到这里
  V2: {
    partial: "\u9694\u5899\u9690\u7EA6\u95FB\u5F97\u7F8E\u65B9\u4EE3\u8868\u56E2\u4E89\u6267\u4E4B\u58F0\uFF0C\u4F3C\u6D89\u8FDC\u4E1C\u4E0E\u8054\u5408\u56FD\u5E2D\u4F4D\u3002",
    full: "\u7F8E\u65B9\u4EE3\u8868\u56E2\u5185\u90E8\u5BC6\u8BAE\uFF1A\u9A6C\u6B47\u5C14\u4E3B\u5F20\u4F18\u5148\u89E3\u51B3\u5BF9\u65E5\u4F5C\u6218\uFF0C\u65AF\u9000\u4E01\u7EBD\u65AF\u5219\u575A\u6301\u8054\u5408\u56FD\u6846\u67B6\u5148\u884C\u3002\u54C8\u91CC\u66FC\u63D0\u53CA\u82CF\u8054\u5728\u8FDC\u4E1C\u7684\u4EF7\u7801\u3002"
  },
  V3: {
    partial: "\u82F1\u65B9\u4F1A\u573A\u4F20\u51FA\u4F4E\u8BED\uFF0C\u4F3C\u6709\u63D0\u53CA\u6B96\u6C11\u5730\u4E0E\u5E1D\u56FD\u9632\u52A1\u3002",
    full: "\u82F1\u65B9\u4EE3\u8868\u56E2\u5BC6\u8BAE\uFF1A\u4E18\u5409\u5C14\u529B\u4E3B\u7EF4\u6301\u5E1D\u56FD\u7248\u56FE\uFF0C\u827E\u767B\u5219\u62C5\u5FE7\u5DE5\u515A\u6C11\u8C03\u6500\u5347\u3002\u5E03\u9C81\u514B\u63D0\u53CA\u5370\u5EA6\u9A7B\u519B\u5403\u7D27\u3002"
  },
  V4: {
    partial: "\u82CF\u65B9\u4F1A\u573A\u6212\u5907\u68EE\u4E25\uFF0C\u4EC5\u5F97\u53EA\u8A00\u7247\u8BED\uFF0C\u4F3C\u6D89\u6CE2\u5170\u4E0E\u8D54\u507F\u3002",
    full: "\u82CF\u65B9\u4EE3\u8868\u56E2\u5BC6\u8BAE\uFF1A\u65AF\u5927\u6797\u6307\u793A\u83AB\u6D1B\u6258\u592B\u5728\u6CE2\u5170\u95EE\u9898\u4E0A\u5BF8\u6B65\u4E0D\u8BA9\uFF0C\u5B89\u4E1C\u8BFA\u592B\u6C47\u62A5\u524D\u7EBF\u63A8\u8FDB\u987A\u5229\uFF0C\u7EF4\u8F9B\u65AF\u57FA\u5DF2\u5907\u59A5\u60C5\u62A5\u5E93\u5F85\u547D\u3002"
  },
  V5: {
    partial: "\u79D8\u5BC6\u8C08\u5224\u5BA4\u4E2D\u4EA4\u950B\u6FC0\u70C8\uFF0C\u4EC5\u95FB\u6570\u56FD\u540D\u8BCD\u788E\u7247\u3002",
    full: "\u79D8\u5BC6\u8C08\u5224\u5B9E\u5F55\uFF1A\u4E09\u56FD\u5C31\u5FB7\u56FD\u5206\u533A\u5360\u9886\u7EC6\u8282\u62C9\u952F\u3002\u7F8E\u65B9\u8BA9\u6B65\u4E8E\u8D54\u507F\u989D\u5EA6\uFF0C\u82CF\u65B9\u5728\u6CE2\u5170\u8FB9\u754C\u7EBF\u4E0A\u5BF8\u571F\u5FC5\u4E89\uFF0C\u82F1\u65B9\u8BD5\u56FE\u65A1\u65CB\u672A\u679C\u3002"
  },
  V6: { partial: "", full: "" }
  // 新闻中心禁听
};
function resolveWiretap(order, intelSkill, seed, salt, sovietJammerActive) {
  const rng = createRng(seed);
  if (order.targetVenue === "V1" || order.targetVenue === "V6") {
    return {
      order,
      success: false,
      successRate: 0,
      roll: 0,
      exposed: false,
      content: "",
      deltas: [],
      narrative: `\u7A83\u542C\u88AB\u62D2\uFF1A${order.targetVenue} \u4E3A\u7981\u542C\u4F1A\u573A\uFF0C\u7279\u5DE5\u65E0\u4ECE\u4E0B\u624B\u3002`
    };
  }
  const isSovietFreePartial = order.nation === "SU" && order.tier === "PARTIAL";
  const targetCounterIntel = COUNTER_INTEL[order.targetNation];
  const sovietJammerPenalty = sovietJammerActive && order.nation !== "SU" ? 15 : 0;
  const homeAdvantage = order.nation === "SU" ? 20 : 0;
  const baseRate = 50 + intelSkill * 3 - targetCounterIntel * 2 - sovietJammerPenalty + homeAdvantage;
  const successRate = clamp(baseRate, 10, 90);
  const { roll, success } = rollCheck(rng, salt + 1, successRate);
  const deltas = [];
  const pointCost = isSovietFreePartial ? 0 : order.tier === "FULL" ? 2 : 0;
  if (pointCost > 0) {
    deltas.push({ nation: order.nation, key: "intelPoints", delta: -pointCost, reason: "\u7A83\u542C\u884C\u52A8\u6D88\u8017" });
  }
  if (success) {
    const intel = VENUE_INTEL[order.targetVenue];
    const content = order.tier === "FULL" ? intel.full : intel.partial;
    deltas.push({ nation: order.nation, key: "intelPoints", delta: 1, reason: "\u7A83\u542C\u5F97\u624B\uFF0C\u60C5\u62A5\u53CD\u54FA" });
    return {
      order,
      success: true,
      successRate,
      roll,
      exposed: false,
      content,
      deltas,
      narrative: `${NATION_NAME2[order.nation]}\u60C5\u62A5\u5B98\u6210\u529F\u6E17\u900F${order.targetVenue}\uFF0C\u83B7\u53D6${order.tier === "FULL" ? "\u5B8C\u6574" : "\u90E8\u5206"}\u60C5\u62A5\u3002\u3014\u80DC\u7B97 ${successRate}%\uFF0C\u63B7\u9AB0 ${roll}\u3015`
    };
  }
  deltas.push({ nation: order.nation, key: "intelPoints", delta: -1, reason: "\u7A83\u542C\u5931\u8D25\uFF0C\u4FE1\u8A89\u635F\u5931" });
  deltas.push({ nation: order.nation, key: "intlOpinion", delta: 8, reason: "\u7A83\u542C\u5931\u8D25\u66DD\u5149\uFF0C\u56FD\u9645\u8206\u8BBA\u54D7\u7136" });
  return {
    order,
    success: false,
    successRate,
    roll,
    exposed: true,
    content: "",
    deltas,
    narrative: `${NATION_NAME2[order.nation]}\u60C5\u62A5\u5B98\u884C\u52A8\u8D25\u9732\uFF0C${NATION_NAME2[order.targetNation]}\u53CD\u60C5\u62A5\u90E8\u95E8\u5F53\u573A\u622A\u83B7\u3002\u5A92\u4F53\u95FB\u98CE\u800C\u81F3\uFF0C\u56FD\u9645\u8206\u8BBA\u5927\u54D7\u3002\u3014\u80DC\u7B97 ${successRate}%\uFF0C\u63B7\u9AB0 ${roll}\u3015`
  };
}

// shared/engine/roosevelt.ts
function statusFromHealth(health, current) {
  if (current === "DECEASED") return "DECEASED";
  if (health <= 0) return "DECEASED";
  if (health < 40) return "CRITICAL";
  if (health < 70) return "DECLINING";
  return "STABLE";
}
var DECAY_RANGE = {
  STABLE: [3, 7],
  // 均值约 -5
  DECLINING: [7, 13],
  // 均值约 -10
  CRITICAL: [18, 27],
  // -15 × 1.5，均值约 -22
  DECEASED: [0, 0]
};
function computeSessionEndHealth(health, status, session, seed) {
  if (status === "DECEASED") {
    return { newHealth: health, newStatus: "DECEASED", decay: 0 };
  }
  const rng = createRng(seed + session * 7919);
  const [lo, hi] = DECAY_RANGE[status];
  const decay = randInt(rng, session * 31, lo, hi);
  const newHealth = clamp(health - decay, 0, 100);
  const newStatus = statusFromHealth(newHealth, status);
  return { newHealth, newStatus, decay };
}
function createBulletin(health, session) {
  let assessment;
  let urgent = false;
  if (health >= 70) {
    assessment = "\u603B\u7EDF\u6C14\u8272\u5C1A\u4F73\uFF0C\u8840\u538B\u5E73\u7A33\uFF0C\u53EF\u8D1F\u8377\u7E41\u91CD\u8BAE\u7A0B\u3002";
  } else if (health >= 40) {
    assessment = "\u603B\u7EDF\u9762\u8272\u5026\u6020\uFF0C\u5076\u6709\u54B3\u5598\uFF0C\u533B\u5E08\u5631\u5176\u8282\u52B3\u3002";
  } else if (health >= 20) {
    assessment = "\u603B\u7EDF\u5F62\u5BB9\u67AF\u69C1\uFF0C\u54B3\u8840\u65F6\u4F5C\uFF0C\u5FC3\u80BA\u529F\u80FD\u6025\u5267\u8870\u9000\u3002";
    urgent = true;
  } else {
    assessment = "\u603B\u7EDF\u5371\u5728\u65E6\u5915\uFF0C\u8840\u538B\u5C45\u9AD8\u4E0D\u4E0B\uFF0C\u610F\u8BC6\u65F6\u6E05\u65F6\u6627\u3002\u7D27\u6025\uFF01";
    urgent = true;
  }
  return { session, assessment, urgent, health };
}
function handleTrumanSuccession(roosevelt) {
  const newRoosevelt = {
    ...roosevelt,
    status: "STABLE",
    // 杜鲁门健康重置
    trumanSucceeded: true,
    vigorPoints: 10
  };
  const newHealth = 70;
  const deltas = [
    { nation: "US", key: "publicSupport", delta: -15, reason: "\u603B\u7EDF\u66F4\u8FED\uFF0C\u56FD\u5185\u9707\u52A8" },
    { nation: "US", key: "oppositionPressure", delta: 10, reason: "\u53CD\u5BF9\u6D3E\u501F\u673A\u53D1\u96BE" }
  ];
  return { newRoosevelt, newHealth, deltas };
}

// shared/engine/stalinArchive.ts
function checkTrigger(polandDiscussedSessions) {
  return polandDiscussedSessions >= 2;
}
function invokeStalinArchive(state, seed, session) {
  if (state.invoked) {
    return { newState: state, deltas: [], narrative: "\u60C5\u62A5\u5E93\u5DF2\u8C03\u7528\uFF0C\u4E0D\u53EF\u91CD\u590D\u4F7F\u7528\u3002" };
  }
  const rng = createRng(seed + session * 31337);
  const { success: noBacklash } = rollCheck(rng, session * 7, 70);
  const backlash = !noBacklash;
  const deltas = [];
  let narrative;
  if (backlash) {
    deltas.push({ nation: "SU", key: "publicSupport", delta: -8, reason: "\u4FE1\u8A89\u7834\u4EA7\uFF0C\u56FD\u5185\u9707\u52A8" });
    const newState2 = {
      ...state,
      status: "ACTIVE",
      invoked: true,
      triggered: true,
      sovietCredibility: 0,
      backlashTurns: 3
    };
    narrative = "\u65AF\u5927\u6797\u4EAE\u51FA\u60C5\u62A5\u5E93\u5E95\u724C\u2014\u2014\u7136\u800C\u897F\u65B9\u9886\u8896\u65E9\u6709\u9632\u5907\uFF0C\u60C5\u62A5\u53CD\u6210\u7B11\u67C4\u3002\u65AF\u5927\u6797\u4FE1\u8A89\u626B\u5730\uFF0C\u540E\u7EED\u4E09\u4F1A\u671F\u5185\u897F\u65B9\u62D2\u7EDD\u4EFB\u4F55\u82CF\u65B9\u63D0\u8BAE\u3002";
    return { newState: newState2, deltas, narrative };
  }
  deltas.push({ nation: "SU", key: "publicSupport", delta: 3, reason: "\u60C5\u62A5\u5A01\u6151\u594F\u6548" });
  const newState = {
    ...state,
    status: "RESOLVED",
    invoked: true,
    triggered: true,
    sovietCredibility: 40,
    backlashTurns: 0
  };
  narrative = "\u65AF\u5927\u6797\u4EAE\u51FA\u60C5\u62A5\u5E93\u5E95\u724C\uFF0C\u897F\u65B9\u9886\u8896\u9762\u9732\u96BE\u8272\u3002\u60C5\u62A5\u5A01\u6151\u594F\u6548\uFF0C\u4F46\u65AF\u5927\u6797\u4FE1\u8A89\u4EA6\u53D7\u6298\u635F\u3002";
  return { newState, deltas, narrative };
}
function settleStalinArchiveAtSessionEnd(state) {
  if (state.backlashTurns > 0) {
    const remaining = state.backlashTurns - 1;
    if (remaining === 0) {
      return {
        newState: { ...state, backlashTurns: 0, sovietCredibility: 50, status: "RESOLVED" },
        narrative: "\u82CF\u8054\u56FD\u9645\u4FE1\u8A89\u5DF2\u6062\u590D\u81F3 50\uFF0C\u6B63\u5E38\u8C08\u5224\u6062\u590D\u3002"
      };
    }
    return {
      newState: { ...state, backlashTurns: remaining },
      narrative: `\u82CF\u8054\u4FE1\u8A89\u7834\u4EA7\u6548\u5E94\u5C1A\u4F59 ${remaining} \u4F1A\u671F\u3002`
    };
  }
  return { newState: state };
}

// shared/engine/polandUprising.ts
function checkOutbreakTrigger(state) {
  return state.phase === "DORMANT" && state.polandDiscussedSessions >= 3;
}
function triggerOutbreak(state) {
  const newState = {
    ...state,
    status: "ACTIVE",
    phase: "OUTBREAK"
  };
  return {
    newState,
    narrative: "\u6025\u7535\u2014\u2014\u534E\u6C99\u7206\u53D1\u5927\u89C4\u6A21\u53CD\u82CF\u793A\u5A01\uFF01\u6CE2\u5170\u5730\u4E0B\u519B\u8D70\u4E0A\u8857\u5934\uFF0C\u4E0E\u82CF\u519B\u6CBB\u5B89\u90E8\u961F\u53D1\u751F\u51B2\u7A81\u3002\u4E09\u5DE8\u5934\u987B\u7ACB\u5373\u8868\u6001\u3002"
  };
}
function respondToOutbreak(state, response) {
  const deltas = [];
  let narrative;
  switch (response) {
    case "SUPPRESS":
      deltas.push({ nation: "UK", key: "colonyUnrest", delta: 5, reason: "\u9547\u538B\u5F15\u53D1\u6B96\u6C11\u5730\u4E0D\u5B89" });
      deltas.push({ nation: "SU", key: "publicSupport", delta: 3, reason: "\u94C1\u8155\u7EF4\u62A4\u79E9\u5E8F" });
      narrative = "\u82CF\u519B\u94C1\u8155\u9547\u538B\u534E\u6C99\u793A\u5A01\uFF0C\u8857\u5792\u88AB\u63A8\u5E73\uFF0C\u9886\u8896\u88AB\u62D8\u62BC\u3002\u82F1\u5C5E\u6B96\u6C11\u5730\u95FB\u8BAF\u4E0D\u5B89\uFF0C\u56FD\u9645\u8206\u8BBA\u54D7\u7136\u3002";
      break;
    case "ALLOW":
      deltas.push({ nation: "SU", key: "oppositionPressure", delta: 10, reason: "\u9ED8\u8BB8\u5F15\u53D1\u56FD\u5185\u5F3A\u786C\u6D3E\u4E0D\u6EE1" });
      narrative = "\u65AF\u5927\u6797\u7F55\u89C1\u5730\u9ED8\u8BB8\u4E86\u793A\u5A01\uFF0C\u6CE2\u5170\u95EE\u9898\u534F\u8BAE\u6FC0\u8FDB\u5EA6\u4E0A\u9650\u4E0B\u8C03\uFF0C\u4F46\u82CF\u8054\u5F3A\u786C\u6D3E\u501F\u6B64\u65BD\u538B\u3002";
      break;
    case "SUPPORT":
      deltas.push({ nation: "US", key: "intlOpinion", delta: -5, reason: "\u897F\u65B9\u516C\u5F00\u652F\u6301\u8D77\u4E49" });
      narrative = "\u897F\u65B9\u516C\u5F00\u652F\u6301\u534E\u6C99\u8D77\u4E49\uFF0C\u8C34\u8D23\u82CF\u8054\u66B4\u653F\u3002\u6B64\u4E3E\u6FC0\u6012\u83AB\u65AF\u79D1\uFF0C\u4F46\u6CE2\u5170\u95EE\u9898\u50F5\u5C40\u51FA\u73B0\u8F6C\u673A\u3002";
      break;
  }
  const newState = {
    ...state,
    phase: "ESCALATION",
    outbreakResponse: response,
    westernIntervened: response === "SUPPORT",
    sovietConceded: response === "ALLOW"
  };
  return { newState, deltas, narrative, nextPhase: "ESCALATION" };
}
function resolvePolandUprising(state) {
  const deltas = [];
  let narrative;
  const suppressNoIntervene = state.outbreakResponse === "SUPPRESS" && !state.westernIntervened;
  const intervenedConceded = state.westernIntervened && state.sovietConceded;
  const bothHardline = state.outbreakResponse === "SUPPRESS" && state.westernIntervened;
  if (bothHardline) {
    deltas.push({ nation: "US", key: "intlOpinion", delta: 20, reason: "\u6CE2\u5170\u6218\u4E89\u5371\u673A\u5347\u7EA7" });
    deltas.push({ nation: "UK", key: "intlOpinion", delta: 20, reason: "\u6CE2\u5170\u6218\u4E89\u5371\u673A\u5347\u7EA7" });
    narrative = '\u6CE2\u5170\u5C40\u52BF\u5931\u63A7\u2014\u2014\u53CC\u65B9\u5F3A\u786C\u5BF9\u5CD9\uFF0C"\u6CE2\u5170\u6218\u4E89"\u7206\u53D1\u3002\u56FD\u9645\u8206\u8BBA\u6CB8\u817E\uFF0C\u7B2C\u4E09\u6B21\u4E16\u754C\u5927\u6218\u7684\u9634\u4E91\u7B3C\u7F69\u96C5\u5C14\u5854\u3002\u3014\u6E38\u620F\u5931\u8D25\u7ED3\u5C40\u4E4B\u4E00\u3015';
  } else if (intervenedConceded) {
    deltas.push({ nation: "US", key: "publicSupport", delta: 10, reason: "\u6CE2\u5170\u4E2D\u7ACB\u5316\uFF0C\u5916\u4EA4\u80DC\u5229" });
    deltas.push({ nation: "UK", key: "publicSupport", delta: 10, reason: "\u6CE2\u5170\u4E2D\u7ACB\u5316\uFF0C\u5916\u4EA4\u80DC\u5229" });
    deltas.push({ nation: "SU", key: "publicSupport", delta: -5, reason: "\u6CE2\u5170\u4E2D\u7ACB\u5316\uFF0C\u82CF\u8054\u8BA9\u6B65" });
    narrative = "\u5728\u5916\u4EA4\u65A1\u65CB\u4E0B\uFF0C\u6CE2\u5170\u5B9E\u73B0\u4E2D\u7ACB\u5316\u3002\u897F\u65B9\u8D62\u5F97\u5916\u4EA4\u80DC\u5229\uFF0C\u82CF\u8054\u867D\u8BA9\u6B65\u4F46\u4FDD\u5168\u4E86\u989C\u9762\u3002";
  } else if (suppressNoIntervene) {
    deltas.push({ nation: "SU", key: "publicSupport", delta: 15, reason: "\u6CE2\u5170\u7EB3\u5165\u52BF\u529B\u8303\u56F4" });
    deltas.push({ nation: "US", key: "publicSupport", delta: -8, reason: "\u6CE2\u5170\u6CA6\u9677\uFF0C\u56FD\u5185\u5931\u671B" });
    deltas.push({ nation: "UK", key: "publicSupport", delta: -8, reason: "\u6CE2\u5170\u6CA6\u9677\uFF0C\u56FD\u5185\u5931\u671B" });
    narrative = "\u897F\u65B9\u8896\u624B\u65C1\u89C2\uFF0C\u6CE2\u5170\u6700\u7EC8\u7EB3\u5165\u82CF\u8054\u52BF\u529B\u8303\u56F4\u3002\u65AF\u5927\u6797\u5927\u83B7\u5168\u80DC\uFF0C\u897F\u65B9\u56FD\u5185\u6C11\u671B\u53D7\u632B\u3002";
  } else {
    narrative = "\u6CE2\u5170\u5C40\u52BF\u5728\u5404\u65B9\u514B\u5236\u4E0B\u9010\u6E10\u5E73\u606F\uFF0C\u59A5\u534F\u65B9\u6848\u6D6E\u51FA\u6C34\u9762\u3002";
  }
  const newState = {
    ...state,
    phase: "RESOLUTION",
    status: "RESOLVED",
    resolution: narrative
  };
  return { newState, deltas, narrative };
}

// shared/engine/ukElection.ts
function settleUKElectionAtSessionEnd(state, seed, session) {
  if (state.churchillRetired) {
    return { newState: state, deltas: [], narratives: [] };
  }
  const rng = createRng(seed + session * 6271);
  const deltas = [];
  const narratives = [];
  const newCountdown = state.countdown - 1;
  const wasAway = state.churchillAway;
  const baseChange = 5 + randInt(rng, session * 13, 0, 5);
  let actualChange = baseChange;
  const hawkishBonus = Math.floor(state.hawkishActions / 3) * 5;
  actualChange += hawkishBonus;
  const softReduction = Math.floor(state.softActions / 2) * 2;
  actualChange -= softReduction;
  const newPolling = clamp(state.laborPolling + actualChange, 0, 100);
  narratives.push(`\u82F1\u56FD\u5DE5\u515A\u6C11\u8C03\uFF1A${state.laborPolling}% \u2192 ${newPolling}%\uFF08\u53D8\u5316 ${actualChange > 0 ? "+" : ""}${actualChange}%\uFF09\u3002`);
  let newState = {
    ...state,
    countdown: newCountdown,
    laborPolling: newPolling,
    churchillAway: false
    // 默认清除（若上会期离场，本会期已返回）
  };
  if (wasAway) {
    narratives.push("\u4E18\u5409\u5C14\u81EA\u4F26\u6566\u8FD4\u62B5\u96C5\u5C14\u5854\uFF0C\u91CD\u65B0\u4E3B\u6301\u82F1\u65B9\u4EE3\u8868\u56E2\u3002");
  }
  if (newPolling >= 60 && !state.churchillRetired) {
    newState = { ...newState, churchillAway: true };
    narratives.push("\u5DE5\u515A\u6C11\u8C03\u7A81\u7834 60%\uFF01\u4E18\u5409\u5C14\u88AB\u8FEB\u4E2D\u65AD\u4E0B\u4F1A\u671F\uFF0C\u98DE\u8FD4\u4F26\u6566\u7EC4\u7EC7\u7ADE\u9009\u3002\u827E\u767B\u5C06\u6682\u4EE3\u82F1\u65B9\u9996\u5E2D\u3002");
    deltas.push({ nation: "UK", key: "oppositionPressure", delta: 8, reason: "\u4E18\u5409\u5C14\u79BB\u573A\uFF0C\u515A\u5185\u52A8\u8361" });
  } else if (newPolling >= 50) {
    narratives.push("\u5DE5\u515A\u6C11\u8C03\u8FC7\u534A\uFF0C\u4E18\u5409\u5C14\u8C08\u5224\u7B79\u7801\u6298\u635F 20%\u3002");
    deltas.push({ nation: "UK", key: "oppositionPressure", delta: 4, reason: "\u6C11\u8C03\u4E0D\u5229\uFF0C\u7B79\u7801\u6298\u635F" });
  }
  if (newCountdown <= 0) {
    newState = {
      ...newState,
      churchillRetired: true,
      status: "RESOLVED",
      churchillAway: false
    };
    const won = newPolling < 50;
    if (won) {
      narratives.push("\u82F1\u56FD\u5927\u9009\u843D\u5E55\u2014\u2014\u4E18\u5409\u5C14\u9669\u80DC\u8FDE\u4EFB\uFF0C\u4F46\u5DF2\u65E0\u6CD5\u8FD4\u56DE\u96C5\u5C14\u5854\u3002\u827E\u767B\u6B63\u5F0F\u63A5\u4EFB\u82F1\u65B9\u9996\u5E2D\u3002");
      deltas.push({ nation: "UK", key: "publicSupport", delta: 5, reason: "\u9009\u4E3E\u80DC\u5229" });
    } else {
      narratives.push("\u82F1\u56FD\u5927\u9009\u843D\u5E55\u2014\u2014\u5DE5\u515A\u5927\u80DC\uFF0C\u4E18\u5409\u5C14\u8D25\u9009\u4E0B\u53F0\u3002\u827E\u767B\u4E34\u5371\u53D7\u547D\uFF0C\u63A5\u4EFB\u82F1\u65B9\u9996\u5E2D\u3002");
      deltas.push({ nation: "UK", key: "publicSupport", delta: -10, reason: "\u6267\u653F\u515A\u8D25\u9009" });
      deltas.push({ nation: "UK", key: "oppositionPressure", delta: 15, reason: "\u5DE5\u515A\u6267\u653F\u538B\u529B" });
    }
  }
  return { newState, deltas, narratives };
}

// shared/engine/petitions.ts
var PETITION_TEMPLATES = [
  { source: "SMALL_STATE", name: "\u6CE2\u5170\u6D41\u4EA1\u653F\u5E9C", topic: "\u8BF7\u6C42\u627F\u8BA4\u4F26\u6566\u6CE2\u5170\u653F\u5E9C\u5408\u6CD5\u6027" },
  { source: "SMALL_STATE", name: "\u6377\u514B\u65AF\u6D1B\u4F10\u514B\u4EE3\u8868", topic: "\u8BF7\u6C42\u4FDD\u969C\u6218\u540E\u9886\u571F\u5B8C\u6574" },
  { source: "SMALL_STATE", name: "\u5357\u65AF\u62C9\u592B\u4EE3\u8868", topic: "\u8BF7\u6C42\u534F\u8C03\u738B\u56FD\u4E0E\u6E38\u51FB\u961F\u4E4B\u4E89" },
  { source: "SMALL_STATE", name: "\u5E0C\u814A\u4EE3\u8868", topic: "\u8BF7\u6C42\u5E72\u9884\u5E0C\u814A\u5185\u653F\u5371\u673A" },
  { source: "COLONY", name: "\u5370\u5EA6\u56FD\u6C11\u5927\u4F1A\u515A", topic: "\u5401\u8BF7\u6218\u540E\u8D4B\u4E88\u5370\u5EA6\u72EC\u7ACB" },
  { source: "COLONY", name: "\u7F05\u7538\u6C11\u65CF\u59D4\u5458\u4F1A", topic: "\u8BF7\u6C42\u6218\u540E\u64A4\u9664\u6B96\u6C11\u7EDF\u6CBB" },
  { source: "COLONY", name: "\u9A6C\u6765\u4E9A union", topic: "\u6297\u8BAE\u6B96\u6C11\u8D44\u6E90\u63A0\u593A" },
  { source: "EXILE_GOV", name: "\u6CD5\u56FD\u6234\u9AD8\u4E50\u6D3E", topic: "\u8BF7\u6C42\u6062\u590D\u6CD5\u56FD\u5927\u56FD\u5730\u4F4D\u4E0E\u6B96\u6C11\u5730" },
  { source: "EXILE_GOV", name: "\u8377\u5170\u6D41\u4EA1\u653F\u5E9C", topic: "\u8BF7\u6C42\u6218\u540E\u5F52\u8FD8\u4E1C\u5370\u5EA6\u7FA4\u5C9B" },
  { source: "EXILE_GOV", name: "\u6BD4\u5229\u65F6\u6D41\u4EA1\u653F\u5E9C", topic: "\u8BF7\u6C42\u4FDD\u969C\u521A\u679C\u8D44\u6E90\u6743\u76CA" }
];
function generatePetitions(state, seed, session) {
  const rng = createRng(seed + session * 4783);
  const count = randInt(rng, session * 17, 1, 2);
  const petitions = [];
  const pool = [...PETITION_TEMPLATES];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(rng, session * 19 + i * 7, 0, pool.length - 1);
    const tmpl = pool.splice(idx, 1)[0];
    petitions.push({
      id: `petition-${session}-${i}`,
      session,
      source: tmpl.source,
      sourceName: tmpl.name,
      topic: tmpl.topic,
      handled: "PENDING"
    });
  }
  const newState = {
    ...state,
    pending: petitions
  };
  const names = petitions.map((p2) => p2.sourceName).join("\u3001");
  return {
    newState,
    petitions,
    narrative: `\u672C\u4F1A\u671F\u6536\u5230 ${petitions.length} \u5C01\u6297\u8BAE\u4FE1\u4E0E\u8BF7\u613F\u4E66\uFF0C\u6765\u81EA\uFF1A${names}\u3002`
  };
}
function handlePetition(state, petitionId, handling) {
  const petition = state.pending.find((p2) => p2.id === petitionId);
  if (!petition) {
    return { newState: state, deltas: [], narrative: "\u672A\u627E\u5230\u8BE5\u8BF7\u613F\u4E66\u3002", crisisTriggered: false };
  }
  const deltas = [];
  let narrative;
  let consecutiveColonyIgnored = state.consecutiveColonyIgnored;
  let crisisTriggered = false;
  switch (handling) {
    case "RESPOND":
      deltas.push({ nation: "US", key: "intlOpinion", delta: -3, reason: "\u56DE\u5E94\u8BF7\u613F\uFF0C\u56FD\u9645\u8206\u8BBA\u7F13\u548C" });
      narrative = `${petition.sourceName}\u7684\u8BF7\u613F\u88AB\u7EB3\u5165\u8BA8\u8BBA\uFF0C\u56FD\u9645\u8206\u8BBA\u7565\u6709\u7F13\u548C\u3002`;
      if (petition.source === "COLONY") consecutiveColonyIgnored = 0;
      break;
    case "ARCHIVE":
      deltas.push({ nation: "US", key: "intlOpinion", delta: 5, reason: "\u8BF7\u613F\u88AB\u5B58\u6863\uFF0C\u8206\u8BBA\u4E0D\u6EE1" });
      if (petition.source === "COLONY") {
        deltas.push({ nation: "UK", key: "colonyUnrest", delta: 3, reason: "\u6B96\u6C11\u5730\u8BF7\u613F\u88AB\u5FFD\u7565" });
        consecutiveColonyIgnored += 1;
      }
      narrative = `${petition.sourceName}\u7684\u8BF7\u613F\u88AB\u5B58\u6863\u6401\u7F6E\uFF0C\u56FD\u9645\u8206\u8BBA\u4E0D\u6EE1\u3002`;
      break;
    case "REJECT":
      deltas.push({ nation: "US", key: "intlOpinion", delta: 8, reason: "\u516C\u5F00\u9A73\u56DE\uFF0C\u8206\u8BBA\u54D7\u7136" });
      if (petition.source === "COLONY") {
        deltas.push({ nation: "UK", key: "colonyUnrest", delta: 5, reason: "\u6B96\u6C11\u5730\u8BF7\u613F\u88AB\u9A73\u56DE" });
        consecutiveColonyIgnored += 1;
      }
      narrative = `${petition.sourceName}\u7684\u8BF7\u613F\u88AB\u516C\u5F00\u9A73\u56DE\uFF0C\u6765\u6E90\u65B9\u654C\u610F\u9AA4\u5347\uFF0C\u56FD\u9645\u8206\u8BBA\u5927\u54D7\u3002`;
      break;
  }
  if (consecutiveColonyIgnored >= 2 && !state.colonyUprisingTriggered) {
    crisisTriggered = true;
    deltas.push({ nation: "UK", key: "colonyUnrest", delta: 20, reason: "\u6B96\u6C11\u5730\u8D77\u4E49\u7206\u53D1" });
    narrative += ' \u8FDE\u7EED\u5FFD\u7565\u6B96\u6C11\u5730\u8BF7\u613F\uFF0C"\u6B96\u6C11\u5730\u8D77\u4E49"\u5371\u673A\u7206\u53D1\uFF01\u82F1\u5C5E\u6B96\u6C11\u5730\u53CD\u6297\u5EA6\u6FC0\u589E\uFF0C\u4F1A\u8BAE\u88AB\u8FEB\u4E2D\u65AD\u5904\u7406\u3002';
  }
  const updatedPetition = { ...petition, handled: handling };
  const newState = {
    ...state,
    pending: state.pending.filter((p2) => p2.id !== petitionId),
    history: [...state.history, updatedPetition],
    consecutiveColonyIgnored,
    colonyUprisingTriggered: crisisTriggered || state.colonyUprisingTriggered
  };
  return { newState, deltas, narrative, crisisTriggered };
}

// shared/engine/protocol.ts
var NATIONS = ["US", "UK", "SU"];
var TOPIC_LABEL = {
  GERMANY: "\u5FB7\u56FD\u95EE\u9898",
  POLAND: "\u6CE2\u5170\u95EE\u9898",
  FAR_EAST: "\u8FDC\u4E1C\u95EE\u9898",
  UN: "\u8054\u5408\u56FD",
  OTHER: "\u5176\u4ED6"
};
function clampBen(v) {
  return Math.max(-100, Math.min(100, Math.round(v)));
}
function clampRad(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}
function createProtocol(draft, proposedBy, id, session) {
  const signatories = Array.from(/* @__PURE__ */ new Set([proposedBy, ...draft.signatories]));
  return {
    id,
    topic: draft.topic,
    title: draft.title.trim() || `${TOPIC_LABEL[draft.topic]}\u534F\u5B9A`,
    radicalness: clampRad(draft.radicalness),
    beneficiary: {
      US: clampBen(draft.beneficiary.US),
      UK: clampBen(draft.beneficiary.UK),
      SU: clampBen(draft.beneficiary.SU)
    },
    signatories,
    agreed: [proposedBy],
    proposedBy,
    secret: draft.secret,
    status: "PROPOSED",
    proposedSession: session
  };
}
function checkSignConditions(state, protocol, nation) {
  if (!protocol.signatories.includes(nation)) {
    return { ok: false, reason: "\u975E\u672C\u7EA6\u7B7E\u7F72\u65B9" };
  }
  const opp = state.metrics[nation].oppositionPressure;
  const cap = maxRadicalness(opp);
  if (protocol.radicalness > cap) {
    return { ok: false, reason: `\u6FC0\u8FDB\u5EA6 ${protocol.radicalness} \u8D85\u51FA\u672C\u56FD\u4E0A\u9650 ${cap}\uFF08\u53CD\u5BF9\u6D3E\u538B\u529B\u8FC7\u9AD8\uFF09` };
  }
  if (nation === "UK" && state.ukElection.churchillRetired) {
    return { ok: false, reason: "\u4E18\u5409\u5C14\u5DF2\u9000\u51FA\u4F1A\u8BAE\uFF0C\u82F1\u65B9\u65E0\u6CD5\u7B7E\u7F72" };
  }
  if (nation === "US" && state.roosevelt.status === "DECEASED" && !state.roosevelt.trumanSucceeded) {
    return { ok: false, reason: "\u7F8E\u65B9\u9886\u5BFC\u4EBA\u7A7A\u7F3A\uFF0C\u65E0\u6CD5\u7B7E\u7F72" };
  }
  return { ok: true };
}
function isFullyAgreed(protocol) {
  return protocol.signatories.every((n) => protocol.agreed.includes(n));
}
function applyProtocol(state, protocol) {
  let next = { ...state };
  const deltas = [];
  if (!protocol.secret) {
    for (const n of NATIONS) {
      const ben = protocol.beneficiary[n];
      deltas.push({
        nation: n,
        key: "publicSupport",
        delta: ben / 10,
        reason: `\u534F\u8BAE\xB7${TOPIC_LABEL[protocol.topic]}`
      });
      const oppDelta = ben > 0 ? -5 : ben < 0 ? 5 : 0;
      if (oppDelta !== 0) {
        deltas.push({ nation: n, key: "oppositionPressure", delta: oppDelta, reason: "\u534F\u8BAE\u6FC0\u8FDB\u5EA6\u535A\u5F08" });
      }
    }
    next = applyDeltas(next, deltas);
  }
  const goals = {
    US: [...state.achievedGoals.US],
    UK: [...state.achievedGoals.UK],
    SU: [...state.achievedGoals.SU]
  };
  const addGoal = (n, g2) => {
    if (!goals[n].includes(g2)) goals[n].push(g2);
  };
  if (protocol.topic === "GERMANY") {
    addGoal("UK", "\u5FB7\u56FD\u5206\u533A\u5360\u9886");
    addGoal("SU", "\u5FB7\u56FD\u5206\u533A\u5360\u9886");
  }
  if (protocol.topic === "POLAND") addGoal("SU", "\u6CE2\u5170\u53D7\u63A7");
  if (protocol.topic === "UN") addGoal("US", "\u8054\u5408\u56FD\u5EFA\u7ACB");
  if (protocol.topic === "FAR_EAST") {
    addGoal("US", "\u82CF\u8054\u5BF9\u65E5\u4F5C\u6218\u627F\u8BFA");
    addGoal("SU", "\u8FDC\u4E1C\u5229\u76CA\u786E\u8BA4");
  }
  const narrative = protocol.secret ? `\u300A${protocol.title}\u300B\u4E8E\u5BC6\u5BA4\u7B7E\u7F72\uFF0C\u4E09\u65B9\u7EA6\u5B9A\u4E25\u5B88\u79D8\u5BC6\uFF0C\u4E16\u95F4\u65E0\u4ECE\u7AA5\u89C1\u5176\u6761\u6B3E\u3002` : `\u300A${protocol.title}\u300B\u7ECF\u7B7E\u7F72\u751F\u6548\uFF0C\u5404\u56FD\u8206\u60C5\u968F\u5229\u76CA\u5206\u914D\u800C\u8D77\u4F0F\u3002`;
  if (protocol.topic === "POLAND" && !next.polandUprising.polandResolvedByTreaty) {
    next = {
      ...next,
      polandUprising: {
        ...next.polandUprising,
        polandResolvedByTreaty: true,
        status: "RESOLVED",
        resolution: "\u7ECF\u6761\u7EA6\u6846\u5B9A\u6CE2\u5170\u8FB9\u754C\uFF0C\u5C40\u52BF\u5F52\u4E8E\u5916\u4EA4\u89E3\u51B3\u3002"
      }
    };
  }
  next = { ...next, achievedGoals: goals };
  return { newState: next, deltas, narrative, achievedGoals: goals };
}
function countFavorableTreaties(state, nation) {
  return state.protocols.filter((p2) => p2.status === "SIGNED" && p2.beneficiary[nation] > 0).length;
}

// shared/engine/settlement.ts
var NATIONS2 = ["US", "UK", "SU"];
var FULL_GOALS = {
  US: ["\u8054\u5408\u56FD\u5EFA\u7ACB", "\u82CF\u8054\u5BF9\u65E5\u4F5C\u6218\u627F\u8BFA", "\u7F57\u65AF\u798F\u5065\u5EB7\u5B58\u6D3B"],
  UK: ["\u5FB7\u56FD\u5206\u533A\u5360\u9886", "\u904F\u5236\u7EA2\u8272\u897F\u6269", "\u4E18\u5409\u5C14\u5168\u7A0B\u4E0E\u4F1A"],
  SU: ["\u5FB7\u56FD\u5206\u533A\u5360\u9886", "\u6CE2\u5170\u53D7\u63A7", "\u8FDC\u4E1C\u5229\u76CA\u786E\u8BA4"]
};
function computeSettlement(state) {
  const achieved = {
    US: [...state.achievedGoals.US],
    UK: [...state.achievedGoals.UK],
    SU: [...state.achievedGoals.SU]
  };
  if (state.roosevelt.status !== "DECEASED") achieved.US.push("\u7F57\u65AF\u798F\u5065\u5EB7\u5B58\u6D3B");
  if (!state.ukElection.churchillRetired) achieved.UK.push("\u4E18\u5409\u5C14\u5168\u7A0B\u4E0E\u4F1A");
  if (countFavorableTreaties(state, "UK") >= 1) achieved.UK.push("\u904F\u5236\u7EA2\u8272\u897F\u6269");
  if (state.polandUprising.polandResolvedByTreaty) achieved.SU.push("\u6CE2\u5170\u53D7\u63A7");
  const scores = {};
  for (const n of NATIONS2) {
    const m = state.metrics[n];
    const fav = countFavorableTreaties(state, n);
    const goalsCount = achieved[n].length;
    const ps = m.publicSupport * 1;
    const op = -m.oppositionPressure * 0.8;
    const cu = -m.colonyUnrest * 0.5;
    const goals = goalsCount * 10;
    const treaties = fav * 5;
    let penalties = 0;
    if (n === "US" && state.roosevelt.status === "DECEASED") penalties -= 30;
    if (n === "UK" && state.ukElection.churchillRetired) penalties -= 40;
    const victoryScore = ps + op + cu + goals + treaties + penalties;
    scores[n] = {
      nation: n,
      victoryScore: Math.round(victoryScore),
      achievedGoals: achieved[n],
      favorableTreaties: fav,
      breakdown: {
        publicSupport: Math.round(ps),
        oppositionPressure: Math.round(op),
        colonyUnrest: Math.round(cu),
        achievedGoals: goals,
        favorableTreaties: treaties,
        penalties
      }
    };
  }
  const specialEndings = [];
  const ww3 = state.intlOpinion >= 95 && (state.polandUprising.resolution?.includes("\u7B2C\u4E09\u6B21\u4E16\u754C\u5927\u6218") ?? false);
  const rooseveltDead = state.roosevelt.status === "DECEASED";
  const churchillOut = state.ukElection.churchillRetired;
  const perfect = !ww3 && state.intlOpinion < 40 && NATIONS2.every((n) => FULL_GOALS[n].every((g2) => achieved[n].includes(g2)));
  if (rooseveltDead) specialEndings.push("\u7F57\u65AF\u798F\u4E8E\u4F1A\u8BAE\u671F\u95F4\u6E98\u7136\u957F\u901D\uFF0C\u7F8E\u65B9\u80DC\u5229\u5206 -30\u3002");
  if (churchillOut) specialEndings.push("\u4E18\u5409\u5C14\u63D0\u524D\u9000\u51FA\uFF0C\u82F1\u65B9\u80DC\u5229\u5206 -40\uFF0C\u7531\u827E\u767B\u63A5\u4EFB\u6536\u5C3E\u3002");
  let outcome;
  let endingTitle;
  let endingText;
  if (ww3) {
    outcome = "ALL_LOSE";
    endingTitle = "\u7B2C\u4E09\u6B21\u4E16\u754C\u5927\u6218";
    endingText = '\u56FD\u9645\u8206\u8BBA\u5F7B\u5E95\u5D29\u574F\uFF0C\u6CE2\u5170\u7684\u706B\u836F\u6876\u88AB\u70B9\u71C3\uFF0C"\u6CE2\u5170\u6218\u4E89"\u6F14\u53D8\u4E3A\u7B2C\u4E09\u6B21\u4E16\u754C\u5927\u6218\u3002\u96C5\u5C14\u5854\u7684\u8C08\u5224\u684C\u672A\u80FD\u963B\u6B62\u4EBA\u7C7B\u6ED1\u5411\u6DF1\u6E0A\u2014\u2014\u8FD9\u662F\u6240\u6709\u5927\u56FD\u5171\u540C\u7684\u5931\u8D25\u3002';
    specialEndings.push("\u56FD\u9645\u8206\u8BBA \u2265 95 \u4E14\u6CE2\u5170\u6218\u4E89\u89E6\u53D1 \u2192 \u7B2C\u4E09\u6B21\u4E16\u754C\u5927\u6218\uFF0C\u5168\u5458\u5931\u8D25\u3002");
  } else if (perfect) {
    outcome = "SHARED";
    endingTitle = "\u5B8C\u7F8E\u96C5\u5C14\u5854";
    endingText = "\u4E09\u5DE8\u5934\u5728\u70DB\u5F71\u6447\u66F3\u95F4\u8FBE\u6210\u4E86\u582A\u79F0\u5B8C\u7F8E\u7684\u6218\u540E\u79E9\u5E8F\uFF1A\u4E09\u56FD\u6218\u7565\u76EE\u6807\u5C3D\u6570\u5B9E\u73B0\uFF0C\u56FD\u9645\u8206\u8BBA\u6E29\u548C\u53EF\u63A7\u3002\u5386\u53F2\u7684\u6307\u9488\u5728\u6B64\u523B\u504F\u5411\u4E86\u548C\u5E73\u4E0E\u5171\u8BC6\u2014\u2014\u8FD9\u662F\u4E00\u573A\u5171\u540C\u7684\u80DC\u5229\u3002";
    specialEndings.push("\u4E09\u56FD\u5747\u8FBE\u6210\u5168\u90E8\u6218\u7565\u76EE\u6807\u4E14\u56FD\u9645\u8206\u8BBA < 40 \u2192 \u5B8C\u7F8E\u96C5\u5C14\u5854\uFF0C\u5171\u540C\u80DC\u5229\u3002");
  } else {
    let winner = "US";
    let top = -Infinity;
    const tied = [];
    for (const n of NATIONS2) {
      const s = scores[n].victoryScore;
      if (s > top) {
        top = s;
        winner = n;
        tied.length = 0;
        tied.push(n);
      } else if (s === top) {
        tied.push(n);
      }
    }
    if (tied.length > 1) {
      outcome = "DRAW";
      endingTitle = "\u5747\u52BF\u5BF9\u5CD9";
      endingText = `${tied.map(nationHan).join("\u3001")}\u4E09\u65B9\u52BF\u5747\u529B\u654C\uFF0C\u80DC\u8D1F\u96BE\u5206\u3002\u6218\u540E\u683C\u5C40\u5728\u5FAE\u5999\u7684\u5E73\u8861\u4E2D\u843D\u5B9A\u3002`;
    } else {
      outcome = winner;
      endingTitle = `${nationHan(winner)}\u5360\u636E\u4E0A\u98CE`;
      endingText = `${nationHan(winner)}\u4EE5 ${top} \u5206\u7684\u603B\u8BC4\u5728\u96C5\u5C14\u5854\u62D4\u5F97\u5934\u7B79\uFF0C\u4E8E\u6218\u540E\u4E16\u754C\u65B0\u79E9\u5E8F\u7684\u535A\u5F08\u4E2D\u5360\u636E\u4E86\u6700\u6709\u5229\u7684\u4F4D\u7F6E\u3002`;
    }
  }
  return { scores, outcome, endingTitle, endingText, specialEndings };
}
function nationHan(n) {
  return n === "US" ? "\u7F8E\u65B9" : n === "UK" ? "\u82F1\u65B9" : "\u82CF\u65B9";
}

// shared/data/seats.ts
var SEATS = [
  // ===== 美利坚合众国代表团 14 人 =====
  { id: "US-01", name: "\u5BCC\u5170\u514B\u6797\xB7\u5FB7\u62C9\u8BFA\xB7\u7F57\u65AF\u798F", nation: "US", role: "LEADER", isLeader: true, personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 1 } },
  { id: "US-02", name: "\u7231\u5FB7\u534E\xB7R\xB7\u65AF\u9000\u4E01\u7EBD\u65AF", nation: "US", role: "DIPLOMAT", personality: { hawkish: 0.3, pragmatic: 0.8, loyal: 0.9 } },
  { id: "US-03", name: "\u5A01\u5EC9\xB7D\xB7\u83B1\u5E0C", nation: "US", role: "MILITARY", commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.95 } },
  { id: "US-04", name: "\u54C8\u91CC\xB7\u970D\u5E03\u91D1\u65AF", nation: "US", role: "AIDE", personality: { hawkish: 0.2, pragmatic: 0.9, loyal: 0.95 } },
  { id: "US-05", name: "\u8A79\u59C6\u58EB\xB7F\xB7\u8D1D\u5C14\u7EB3\u65AF", nation: "US", role: "AIDE", personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.8 } },
  { id: "US-06", name: "\u4E54\u6CBB\xB7C\xB7\u9A6C\u6B47\u5C14", nation: "US", role: "MILITARY", commanderSkill: 10, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.9 } },
  { id: "US-07", name: "\u6B27\u5185\u65AF\u7279\xB7J\xB7\u91D1", nation: "US", role: "MILITARY", commanderSkill: 9, personality: { hawkish: 0.7, pragmatic: 0.6, loyal: 0.85 } },
  { id: "US-08", name: "\u5E03\u91CC\u6069\xB7B\xB7\u7D22\u9ED8\u97E6\u5C14", nation: "US", role: "MILITARY", commanderSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: "US-09", name: "\u57C3\u9ED8\u91CC\xB7S\xB7\u5170\u5FB7", nation: "US", role: "MILITARY", commanderSkill: 6, personality: { hawkish: 0.4, pragmatic: 0.6, loyal: 0.8 } },
  { id: "US-10", name: "L\xB7S\xB7\u5361\u7279", nation: "US", role: "MILITARY", commanderSkill: 7, personality: { hawkish: 0.6, pragmatic: 0.6, loyal: 0.85 } },
  { id: "US-11", name: "W\xB7\u963F\u5F17\u91CC\u5C14\xB7\u54C8\u91CC\u66FC", nation: "US", role: "DIPLOMAT", personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },
  { id: "US-12", name: "H\xB7\u5F17\u91CC\u66FC\xB7\u9A6C\u4FEE\u65AF", nation: "US", role: "DIPLOMAT", personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.85 } },
  { id: "US-13", name: "\u963F\u8033\u6770\u5C14\xB7\u5E0C\u65AF", nation: "US", role: "INTEL", intelSkill: 7, personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.4 } },
  { id: "US-14", name: "\u67E5\u5C14\u65AF\xB7E\xB7\u6CE2\u4F26", nation: "US", role: "DIPLOMAT", personality: { hawkish: 0.3, pragmatic: 0.8, loyal: 0.9 } },
  // ===== 大不列颠及北爱尔兰联合王国代表团 13 人 =====
  { id: "UK-01", name: "\u6E29\u65AF\u987F\xB7\u4E18\u5409\u5C14", nation: "UK", role: "LEADER", isLeader: true, personality: { hawkish: 0.8, pragmatic: 0.6, loyal: 1 } },
  { id: "UK-02", name: "\u5B89\u4E1C\u5C3C\xB7\u827E\u767B", nation: "UK", role: "DIPLOMAT", personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.9 } },
  { id: "UK-03", name: "\u83B1\u745F\u65AF\u52CB\u7235", nation: "UK", role: "AIDE", personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-04", name: "\u514B\u62C9\u514B\xB7\u5361\u5C14\u7235\u58EB", nation: "UK", role: "INTEL", intelSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },
  { id: "UK-05", name: "\u4E9A\u5386\u5C71\u5927\xB7\u8D3E\u5FB7\u5E72\u7235\u58EB", nation: "UK", role: "DIPLOMAT", personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.9 } },
  { id: "UK-06", name: "\u7231\u5FB7\u534E\xB7\u5E03\u91CC\u5947\u7235\u58EB", nation: "UK", role: "AIDE", personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-07", name: "\u827E\u4F26\xB7\u5E03\u9C81\u514B\u7235\u58EB", nation: "UK", role: "MILITARY", commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.9 } },
  { id: "UK-08", name: "\u67E5\u5C14\u65AF\xB7\u6CE2\u7279\u8033\u7235\u58EB", nation: "UK", role: "MILITARY", commanderSkill: 8, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-09", name: "\u5B89\u5FB7\u9C81\xB7\u80AF\u5B81\u5B89\u7235\u58EB", nation: "UK", role: "MILITARY", commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-10", name: "\u9ED1\u65AF\u5EF7\u65AF\xB7\u4F0A\u65AF\u6885\u7235\u58EB", nation: "UK", role: "AIDE", personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.9 } },
  { id: "UK-11", name: "\u4E9A\u5386\u5C71\u5927\u9646\u519B\u5143\u5E05", nation: "UK", role: "MILITARY", commanderSkill: 8, personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-12", name: "\u5A01\u5C14\u900A\u9646\u519B\u5143\u5E05", nation: "UK", role: "MILITARY", commanderSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: "UK-13", name: "\u8428\u59C6\u5FAE\u8033\u6D77\u519B\u4E0A\u5C06", nation: "UK", role: "MILITARY", commanderSkill: 7, personality: { hawkish: 0.5, pragmatic: 0.6, loyal: 0.8 } },
  // ===== 苏维埃社会主义共和国联盟代表团 9 人 =====
  { id: "SU-01", name: "\u7EA6\u745F\u592B\xB7\u7EF4\u8428\u91CC\u5965\u8BFA\u7EF4\u5947\xB7\u65AF\u5927\u6797", nation: "SU", role: "LEADER", isLeader: true, personality: { hawkish: 0.7, pragmatic: 0.8, loyal: 1 } },
  { id: "SU-02", name: "\u83AB\u6D1B\u6258\u592B", nation: "SU", role: "DIPLOMAT", personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.9 } },
  { id: "SU-03", name: "\u5E93\u5179\u6D85\u4F50\u592B", nation: "SU", role: "MILITARY", commanderSkill: 8, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: "SU-04", name: "\u5B89\u4E1C\u8BFA\u592B", nation: "SU", role: "MILITARY", commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: "SU-05", name: "\u7EF4\u8F9B\u65AF\u57FA", nation: "SU", role: "INTEL", intelSkill: 8, personality: { hawkish: 0.7, pragmatic: 0.6, loyal: 0.9 } },
  { id: "SU-06", name: "\u8FC8\u65AF\u751A", nation: "SU", role: "DIPLOMAT", personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.85 } },
  { id: "SU-07", name: "\u79D1\u8FEA\u4E9A\u5E93\u592B", nation: "SU", role: "MILITARY", commanderSkill: 7, personality: { hawkish: 0.5, pragmatic: 0.6, loyal: 0.8 } },
  { id: "SU-08", name: "\u7FDF\u585E\u592B", nation: "SU", role: "DIPLOMAT", personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: "SU-09", name: "\u845B\u7F57\u7C73\u67EF", nation: "SU", role: "DIPLOMAT", personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },
  // ===== 新闻媒体记者团 6 人 =====
  { id: "PR-01", name: "\u7F8E\u8054\u793E\u8BB0\u8005", nation: "US", role: "JOURNALIST", personality: { hawkish: 0.3, pragmatic: 0.6, loyal: 0.7 } },
  { id: "PR-02", name: "\u8DEF\u900F\u793E\u8BB0\u8005", nation: "UK", role: "JOURNALIST", personality: { hawkish: 0.3, pragmatic: 0.6, loyal: 0.7 } },
  { id: "PR-03", name: "\u5854\u65AF\u793E\u8BB0\u8005", nation: "SU", role: "JOURNALIST", personality: { hawkish: 0.2, pragmatic: 0.5, loyal: 0.95 } },
  { id: "PR-04", name: "\u300A\u771F\u7406\u62A5\u300B\u8BB0\u8005", nation: "SU", role: "JOURNALIST", personality: { hawkish: 0.2, pragmatic: 0.5, loyal: 0.95 } },
  { id: "PR-05", name: "\u6CD5\u65B0\u793E\u8BB0\u8005", nation: "UK", role: "JOURNALIST", personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.6 } },
  { id: "PR-06", name: "\u4E2D\u592E\u793E\u8BB0\u8005", nation: "US", role: "JOURNALIST", personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.6 } }
];

// shared/data/venues.ts
var VENUES = [
  { id: "V1", name: "\u9886\u5BFC\u4EBA\u4F1A\u8BAE", allowWiretap: false, sovietHomeAdvantage: false },
  { id: "V2", name: "\u7F8E\u56FD\u4EE3\u8868\u56E2\u4F1A\u8BAE", allowWiretap: true, sovietHomeAdvantage: false },
  { id: "V3", name: "\u82F1\u56FD\u4EE3\u8868\u56E2\u4F1A\u8BAE", allowWiretap: true, sovietHomeAdvantage: false },
  { id: "V4", name: "\u82CF\u8054\u4EE3\u8868\u56E2\u4F1A\u8BAE", allowWiretap: true, sovietHomeAdvantage: true },
  { id: "V5", name: "\u79D8\u5BC6\u8C08\u5224\u5BA4", allowWiretap: true, sovietHomeAdvantage: true },
  { id: "V6", name: "\u65B0\u95FB\u5A92\u4F53\u4E2D\u5FC3", allowWiretap: false, sovietHomeAdvantage: false }
];

// server/src/gameServer.ts
var TOTAL_SESSIONS = 7;
var PHASE_ORDER = ["TOPIC", "VENUE", "MILITARY", "CRISIS", "PRESS"];
var SESSION_DATE = ["1945\u5E742\u67084\u65E5", "1945\u5E742\u67085\u65E5", "1945\u5E742\u67086\u65E5", "1945\u5E742\u67087\u65E5", "1945\u5E742\u67088\u65E5", "1945\u5E742\u67089\u65E5", "1945\u5E742\u670810\u65E5"];
var PHASE_NARRATIVE = {
  TOPIC: "\uFF08\u8BAE\u69CC\u58F0\uFF09\u4E09\u5DE8\u5934\u5165\u5EA7\uFF0C\u672C\u65E5\u8BAE\u7A0B\u5F85\u5B9A\u3002",
  VENUE: "\u4EE3\u8868\u56E2\u79FB\u6B65\u5404\u4F1A\u573A\uFF0C\u5BC6\u8BAE\u5F00\u59CB\u3002\u60C5\u62A5\u5B98\u5404\u663E\u795E\u901A\u3002",
  MILITARY: "\u524D\u7EBF\u6218\u62A5\u9001\u8FBE\uFF0C\u519B\u4E8B\u5C06\u9886\u9F50\u805A\u4F5C\u6218\u5BA4\u3002",
  CRISIS: "\u6025\u7535\u62B5\u8FBE\uFF0C\u4F1A\u8BAE\u88AB\u8FEB\u8F6C\u5165\u5371\u673A\u5E94\u5BF9\u3002",
  PRESS: "\u8BB0\u8005\u6D8C\u5165\u5927\u5385\uFF0C\u95EA\u5149\u706F\u6B64\u8D77\u5F7C\u4F0F\u3002"
};
var NATION_HAN = { US: "\u7F8E\u65B9", UK: "\u82F1\u65B9", SU: "\u82CF\u65B9" };
var TOPIC_HAN = {
  GERMANY: "\u5FB7\u56FD\u95EE\u9898",
  POLAND: "\u6CE2\u5170\u95EE\u9898",
  FAR_EAST: "\u8FDC\u4E1C\u95EE\u9898",
  UN: "\u8054\u5408\u56FD",
  OTHER: "\u5176\u4ED6"
};
function nationHan2(n) {
  return NATION_HAN[n];
}
function topicHan(t) {
  return TOPIC_HAN[t];
}
var KEY_HAN = {
  publicSupport: "\u56FD\u5185\u6C11\u671B",
  intelPoints: "\u60C5\u62A5\u50A8\u5907",
  oppositionPressure: "\u53CD\u5BF9\u6D3E\u538B\u529B",
  colonyUnrest: "\u6B96\u6C11\u5730\u52A8\u8361",
  intlOpinion: "\u56FD\u9645\u8206\u8BBA",
  rooseveltHealth: "\u7F57\u65AF\u798F\u5065\u5EB7"
};
var GameServer = class {
  state;
  pendingIntel = [];
  constructor(seed = 20250204) {
    this.state = createInitialState(seed);
    this.state = this.generatePetitionsAtSessionStart();
  }
  /** 序列化为客户端可见状态 */
  serialize() {
    const s = this.state;
    return {
      session: s.session,
      phase: s.phase,
      metrics: s.metrics,
      intlOpinion: s.intlOpinion,
      rooseveltHealth: s.rooseveltHealth,
      roosevelt: s.roosevelt,
      medicalBulletins: s.medicalBulletins,
      sovietJammerActive: s.sovietJammerActive,
      stalinArchive: s.stalinArchive,
      polandUprising: s.polandUprising,
      ukElection: s.ukElection,
      petitions: {
        pending: s.petitions.pending,
        historyCount: s.petitions.history.length,
        consecutiveColonyIgnored: s.petitions.consecutiveColonyIgnored,
        colonyUprisingTriggered: s.petitions.colonyUprisingTriggered
      },
      protocols: s.protocols,
      achievedGoals: s.achievedGoals,
      settlement: s.settlement,
      logs: s.logs,
      gameEnded: s.settlement !== null
    };
  }
  /** 裁决游戏动作 */
  performAction(action) {
    switch (action.kind) {
      case "MILITARY_ORDER":
        return this.doMilitaryOrder(action.order);
      case "WIRETAP":
        return this.doWiretap(action.order);
      case "DEPLOY_JAMMER":
        return this.doDeployJammer();
      case "INVOKE_STALIN_ARCHIVE":
        return this.doInvokeStalinArchive();
      case "POLAND_RESPONSE":
        return this.doPolandResponse(action.response);
      case "POLAND_RESOLVE":
        return this.doPolandResolve();
      case "PETITION_HANDLE":
        return this.doPetitionHandle(action.petitionId, action.handling);
      case "PROPOSE_PROTOCOL":
        return this.doProposeProtocol(action.draft, action.proposedBy);
      case "SIGN_PROTOCOL":
        return this.doSignProtocol(action.protocolId, action.nation);
    }
  }
  appendLog(text, kind) {
    const entry = {
      id: `log-${this.state.actionCounter}-${this.state.logs.length}`,
      session: this.state.session,
      phase: this.state.phase,
      text,
      kind
    };
    this.state = { ...this.state, logs: [...this.state.logs, entry] };
    return entry;
  }
  logDeltas(deltas) {
    if (deltas.length === 0) return null;
    const detail = deltas.map((d) => `${NATION_HAN[d.nation]}${KEY_HAN[d.key]}${d.delta > 0 ? "\u4E0A\u626C" : "\u4E0B\u632B"}${d.delta > 0 ? "+" : ""}${d.delta}`).join("\uFF0C");
    return this.appendLog(`\u56FD\u60C5\u7B80\u62A5\uFF1A${detail}\u3002`, "info");
  }
  doMilitaryOrder(order) {
    const seat = SEATS.find((s) => s.id === order.seatId);
    if (!seat || seat.role !== "MILITARY") {
      return { success: false, message: `${order.seatId} \u65E0\u519B\u4E8B\u6307\u6325\u6743`, newLogs: [] };
    }
    const commanderSkill = seat.commanderSkill ?? 5;
    const salt = this.state.session * 1e3 + this.state.actionCounter;
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const result = resolveMilitaryOrder(order, commanderSkill, this.state.seed, salt);
    const newLogs = [];
    newLogs.push(this.appendLog(
      `\u5229\u74E6\u5B63\u4E9A\u5BAB\u8BAF\u2014\u2014${seat.name} \u7B7E\u7F72${order.type === "OFFENSIVE" ? "\u8FDB\u653B" : order.type === "DEFENSIVE" ? "\u9632\u5FA1" : order.type === "WITHDRAW" ? "\u64A4\u9000" : "\u91CD\u65B0\u90E8\u7F72"}\u4EE4\uFF0C\u76EE\u6807 ${order.target}\u3002`,
      "action"
    ));
    this.state = applyDeltas(this.state, result.deltas);
    newLogs.push(this.appendLog(result.narrative, "result"));
    const deltaLog = this.logDeltas(result.deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u519B\u4EE4\u5DF2\u53D1", newLogs };
  }
  doWiretap(order) {
    const seat = SEATS.find((s) => s.id === order.seatId);
    if (!seat || seat.role !== "INTEL") {
      return { success: false, message: `${order.seatId} \u65E0\u60C5\u62A5\u804C\u6743`, newLogs: [] };
    }
    const intelSkill = seat.intelSkill ?? 5;
    const salt = this.state.session * 1e3 + this.state.actionCounter;
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const result = resolveWiretap(order, intelSkill, this.state.seed, salt, this.state.sovietJammerActive);
    const newLogs = [];
    const venueName = VENUES.find((v) => v.id === order.targetVenue)?.name ?? order.targetVenue;
    const tierLabel = order.tier === "FULL" ? "\u5B8C\u6574\u60C5\u62A5" : "\u90E8\u5206\u60C5\u62A5";
    newLogs.push(this.appendLog(`\u6697\u7EBF\u6D88\u606F\u2014\u2014${seat.name} \u53D7\u547D\u6F5C\u5165${venueName}\uFF0C\u610F\u6B32\u83B7\u53D6${tierLabel}\u3002`, "action"));
    this.state = applyDeltas(this.state, result.deltas);
    newLogs.push(this.appendLog(result.narrative, result.success ? "result" : "crisis"));
    let privateIntel;
    let privateNation;
    if (result.success && result.content) {
      privateIntel = {
        id: `intel-${this.state.actionCounter}`,
        session: this.state.session,
        nation: order.nation,
        venueName,
        content: result.content,
        tier: order.tier
      };
      privateNation = order.nation;
    }
    const deltaLog = this.logDeltas(result.deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u5BC6\u4EE4\u5DF2\u53D1", newLogs, privateIntel, privateNation };
  }
  doDeployJammer() {
    if (this.state.sovietJammerActive) {
      return { success: false, message: "\u5E72\u6270\u5668\u5DF2\u90E8\u7F72", newLogs: [] };
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1, sovietJammerActive: true };
    const newLogs = [this.appendLog("\u82CF\u65B9\u5728\u5229\u74E6\u5B63\u4E9A\u5BAB\u79D8\u5BC6\u542F\u7528\u65E0\u7EBF\u7535\u5E72\u6270\u5668\uFF0C\u4ED6\u56FD\u76D1\u542C\u80DC\u7B97\u9AA4\u964D\u3002", "action")];
    return { success: true, message: "\u5E72\u6270\u5668\u5DF2\u542F\u7528", newLogs };
  }
  doInvokeStalinArchive() {
    if (!checkTrigger(this.state.polandUprising.polandDiscussedSessions)) {
      return { success: false, message: "\u6CE2\u5170\u95EE\u9898\u5C1A\u672A\u9677\u5165\u50F5\u5C40", newLogs: [] };
    }
    if (this.state.stalinArchive.invoked) {
      return { success: false, message: "\u60C5\u62A5\u5E93\u5DF2\u8C03\u7528", newLogs: [] };
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const { newState, deltas, narrative } = invokeStalinArchive(this.state.stalinArchive, this.state.seed, this.state.session);
    this.state = { ...this.state, stalinArchive: newState };
    const newLogs = [];
    newLogs.push(this.appendLog("\u6697\u8C0D\u6D88\u606F\u2014\u2014\u65AF\u5927\u6797\u4EAE\u51FA\u60C5\u62A5\u5E93\u5E95\u724C\u3002", "action"));
    newLogs.push(this.appendLog(narrative, deltas.length > 0 ? "crisis" : "result"));
    this.state = applyDeltas(this.state, deltas);
    const deltaLog = this.logDeltas(deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u5E95\u724C\u5DF2\u4EAE", newLogs };
  }
  doPolandResponse(response) {
    if (this.state.polandUprising.phase !== "OUTBREAK") {
      return { success: false, message: "\u65E0\u6CE2\u5170\u5371\u673A\u5F85\u5E94\u5BF9", newLogs: [] };
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const { newState, deltas, narrative } = respondToOutbreak(this.state.polandUprising, response);
    this.state = { ...this.state, polandUprising: newState };
    const newLogs = [];
    const label = response === "SUPPRESS" ? "\u82CF\u519B\u94C1\u8155\u9547\u538B" : response === "ALLOW" ? "\u65AF\u5927\u6797\u9ED8\u8BB8" : "\u897F\u65B9\u516C\u5F00\u652F\u6301";
    newLogs.push(this.appendLog(`\u6CE2\u5170\u5371\u673A\u5E94\u5BF9\u2014\u2014${label}\u3002`, "action"));
    newLogs.push(this.appendLog(narrative, "crisis"));
    this.state = applyDeltas(this.state, deltas);
    const deltaLog = this.logDeltas(deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u5DF2\u8868\u6001", newLogs };
  }
  doPolandResolve() {
    if (this.state.polandUprising.phase !== "ESCALATION") {
      return { success: false, message: "\u6CE2\u5170\u5371\u673A\u5C1A\u672A\u5230\u89E3\u51B3\u4E4B\u65F6", newLogs: [] };
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const { newState, deltas, narrative } = resolvePolandUprising(this.state.polandUprising);
    this.state = { ...this.state, polandUprising: newState };
    const newLogs = [];
    newLogs.push(this.appendLog("\u6CE2\u5170\u5371\u673A\u7EC8\u5C40\u2014\u2014", "action"));
    newLogs.push(this.appendLog(narrative, "result"));
    this.state = applyDeltas(this.state, deltas);
    const deltaLog = this.logDeltas(deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u7EC8\u5C40\u5DF2\u5B9A", newLogs };
  }
  doPetitionHandle(petitionId, handling) {
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const { newState, deltas, narrative, crisisTriggered } = handlePetition(this.state.petitions, petitionId, handling);
    this.state = { ...this.state, petitions: newState };
    const newLogs = [];
    const label = handling === "RESPOND" ? "\u56DE\u5E94\u5E76\u7EB3\u5165\u8BA8\u8BBA" : handling === "ARCHIVE" ? "\u5B58\u6863\u4E0D\u5904\u7406" : "\u516C\u5F00\u9A73\u56DE";
    newLogs.push(this.appendLog(`\u8BF7\u613F\u5904\u7F6E\u2014\u2014${label}\u3002`, "action"));
    newLogs.push(this.appendLog(narrative, crisisTriggered ? "crisis" : "result"));
    this.state = applyDeltas(this.state, deltas);
    const deltaLog = this.logDeltas(deltas);
    if (deltaLog) newLogs.push(deltaLog);
    return { success: true, message: "\u5DF2\u5904\u7F6E", newLogs };
  }
  doProposeProtocol(draft, proposedBy) {
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const id = `p-${this.state.session}-${this.state.actionCounter}`;
    const protocol = createProtocol(draft, proposedBy, id, this.state.session);
    this.state = { ...this.state, protocols: [...this.state.protocols, protocol] };
    const newLogs = [
      this.appendLog(
        `\u5916\u4EA4\u63D0\u6848\u2014\u2014${nationHan2(protocol.proposedBy)}\u63D0\u51FA\u300A${protocol.title}\u300B\uFF08\u8BAE\u9898\uFF1A${topicHan(protocol.topic)}\uFF0C\u6FC0\u8FDB\u5EA6 ${protocol.radicalness}\uFF09\u3002\u5F85\u5404\u65B9\u7B7E\u7F72\u3002`,
        "action"
      )
    ];
    return { success: true, message: "\u63D0\u6848\u5DF2\u63D0\u4EA4", newLogs };
  }
  doSignProtocol(protocolId, nation) {
    const protocol = this.state.protocols.find((p2) => p2.id === protocolId);
    if (!protocol) {
      return { success: false, message: "\u534F\u8BAE\u4E0D\u5B58\u5728", newLogs: [] };
    }
    if (protocol.status !== "PROPOSED") {
      return { success: false, message: "\u8BE5\u534F\u8BAE\u5DF2\u975E\u5F85\u7B7E\u72B6\u6001", newLogs: [] };
    }
    if (!protocol.signatories.includes(nation)) {
      return { success: false, message: "\u975E\u672C\u7EA6\u7B7E\u7F72\u65B9", newLogs: [] };
    }
    if (protocol.agreed.includes(nation)) {
      return { success: false, message: "\u8D35\u65B9\u5DF2\u7B7E\u7F72", newLogs: [] };
    }
    const check = checkSignConditions(this.state, protocol, nation);
    if (!check.ok) {
      return { success: false, message: check.reason ?? "\u65E0\u6CD5\u7B7E\u7F72", newLogs: [] };
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 };
    const agreed = [...protocol.agreed, nation];
    const updated = { ...protocol, agreed };
    const newLogs = [
      this.appendLog(`\u7B7E\u7EA6\u2014\u2014${nationHan2(nation)}\u7B7E\u7F72\u300A${protocol.title}\u300B\u3002`, "action")
    ];
    if (isFullyAgreed(updated)) {
      const { newState, deltas, narrative } = applyProtocol(this.state, updated);
      const signed = { ...updated, status: "SIGNED", signedSession: this.state.session };
      this.state = { ...newState, protocols: this.state.protocols.map((p2) => p2.id === protocol.id ? signed : p2) };
      newLogs.push(this.appendLog(narrative, "result"));
      const dl = this.logDeltas(deltas);
      if (dl) newLogs.push(dl);
    } else {
      this.state = {
        ...this.state,
        protocols: this.state.protocols.map((p2) => p2.id === protocol.id ? updated : p2)
      };
    }
    return { success: true, message: "\u5DF2\u7B7E\u7F72", newLogs };
  }
  /** 推进阶段/会期 */
  advancePhase() {
    const idx = PHASE_ORDER.indexOf(this.state.phase);
    const newLogs = [];
    if (idx < PHASE_ORDER.length - 1) {
      const to = PHASE_ORDER[idx + 1];
      this.state = { ...this.state, phase: to };
      newLogs.push(this.appendLog(PHASE_NARRATIVE[to], "info"));
    } else {
      if (this.state.session >= TOTAL_SESSIONS) {
        const settlement = computeSettlement(this.state);
        this.state = { ...this.state, settlement };
        newLogs.push(this.appendLog("1945\u5E742\u670811\u65E5\uFF0C\u96C5\u5C14\u5854\u4F1A\u8BAE\u95ED\u5E55\u3002\u4E09\u5DE8\u5934\u7B7E\u7F72\u516C\u62A5\uFF0C\u5386\u53F2\u5C31\u6B64\u5B9A\u683C\u3002", "info"));
        newLogs.push(this.appendLog(`\u3014\u7ED3\u7B97\u3015${settlement.endingTitle}\u2014\u2014${settlement.endingText}`, "result"));
        for (const e of settlement.specialEndings) {
          newLogs.push(this.appendLog(`\u3014\u7ED3\u5C40\u3015${e}`, "crisis"));
        }
        return newLogs;
      }
      this.settleEventChainsAtSessionEnd(newLogs);
      const nextSession = this.state.session + 1;
      this.state = { ...this.state, session: nextSession, phase: "TOPIC", sovietJammerActive: false };
      newLogs.push(this.appendLog(`\u2014\u2014 ${SESSION_DATE[nextSession - 1]}\uFF0C\u7B2C ${nextSession} \u4F1A\u671F\u5F00\u59CB \u2014\u2014`, "info"));
      this.generatePetitionsAtSessionStart(newLogs);
    }
    return newLogs;
  }
  settleEventChainsAtSessionEnd(newLogs) {
    this.settleRoosevelt(newLogs);
    if (this.state.stalinArchive.backlashTurns > 0) {
      const { newState, narrative } = settleStalinArchiveAtSessionEnd(this.state.stalinArchive);
      this.state = { ...this.state, stalinArchive: newState };
      if (narrative) newLogs.push(this.appendLog(narrative, "info"));
    }
    this.settlePoland(newLogs);
    {
      const { newState, deltas, narratives } = settleUKElectionAtSessionEnd(this.state.ukElection, this.state.seed, this.state.session);
      this.state = { ...this.state, ukElection: newState };
      for (const n of narratives) newLogs.push(this.appendLog(n, "info"));
      if (deltas.length > 0) {
        this.state = applyDeltas(this.state, deltas);
        const dl = this.logDeltas(deltas);
        if (dl) newLogs.push(dl);
      }
    }
  }
  settleRoosevelt(newLogs) {
    if (this.state.roosevelt.status === "DECEASED") return;
    const { newHealth, newStatus, decay } = computeSessionEndHealth(this.state.rooseveltHealth, this.state.roosevelt.status, this.state.session, this.state.seed);
    this.state = { ...this.state, rooseveltHealth: newHealth, roosevelt: { ...this.state.roosevelt, status: newStatus, bulletinDelivered: false } };
    if (decay > 0) newLogs.push(this.appendLog(`\u603B\u7EDF\u5065\u5EB7\uFF1A\u672C\u4F1A\u671F\u8870\u51CF ${decay} \u5EA6\uFF0C\u73B0\u4F59 ${newHealth} \u5EA6\u3002`, "info"));
    const bulletin = createBulletin(newHealth, this.state.session);
    this.state = { ...this.state, medicalBulletins: [...this.state.medicalBulletins, bulletin], roosevelt: { ...this.state.roosevelt, bulletinDelivered: true } };
    newLogs.push(this.appendLog(`\u533B\u7597\u7B80\u62A5\uFF08\u7B2C${this.state.session}\u4F1A\u671F\uFF09\uFF1A${bulletin.assessment}${bulletin.urgent ? "\u3010\u7D27\u6025\u3011" : ""}`, bulletin.urgent ? "crisis" : "info"));
    if (newStatus === "DECEASED" && !this.state.roosevelt.trumanSucceeded) {
      const { newRoosevelt, newHealth: trumanHealth, deltas } = handleTrumanSuccession(this.state.roosevelt);
      this.state = { ...this.state, roosevelt: newRoosevelt, rooseveltHealth: trumanHealth };
      newLogs.push(this.appendLog("\u5669\u8017\u4F20\u6765\u2014\u2014\u7F57\u65AF\u798F\u603B\u7EDF\u4E8E\u4F1A\u671F\u4E2D\u6BB5\u6E98\u7136\u957F\u901D\u3002\u526F\u603B\u7EDF\u675C\u9C81\u95E8\u706B\u901F\u7EE7\u4EFB\uFF0C\u98DE\u62B5\u96C5\u5C14\u5854\u3002\u7F8E\u65B9\u8C08\u5224\u7B79\u7801\u9AA4\u51CF\u3002", "crisis"));
      this.state = applyDeltas(this.state, deltas);
      const dl = this.logDeltas(deltas);
      if (dl) newLogs.push(dl);
    }
  }
  settlePoland(newLogs) {
    if (this.state.polandUprising.status === "DORMANT" || this.state.polandUprising.status === "ACTIVE") {
      this.state = { ...this.state, polandUprising: { ...this.state.polandUprising, polandDiscussedSessions: this.state.polandUprising.polandDiscussedSessions + 1 } };
    }
    if (checkOutbreakTrigger(this.state.polandUprising)) {
      const { newState, narrative } = triggerOutbreak(this.state.polandUprising);
      this.state = { ...this.state, polandUprising: newState };
      newLogs.push(this.appendLog(narrative, "crisis"));
    }
  }
  generatePetitionsAtSessionStart(newLogs) {
    const { newState, narrative } = generatePetitions(this.state.petitions, this.state.seed, this.state.session);
    this.state = { ...this.state, petitions: newState };
    if (newState.pending.length > 0 && newLogs) {
      newLogs.push(this.appendLog(narrative, "info"));
    }
    return this.state;
  }
  reset(seed) {
    this.state = createInitialState(seed);
    this.state = this.generatePetitionsAtSessionStart();
  }
};

// _proto_test.ts
var g = new GameServer(20250204);
var before = g.state.protocols.length;
g.performAction({
  kind: "PROPOSE_PROTOCOL",
  draft: { topic: "GERMANY", title: "\u5FB7\u56FD\u5206\u533A\u534F\u5B9A", radicalness: 30, beneficiary: { US: 30, UK: 45, SU: 45 }, signatories: ["US", "UK", "SU"], secret: false },
  proposedBy: "US"
});
console.log("\u63D0\u6848\u6570:", g.state.protocols.length, "(\u5E94 =", before + 1, ")");
var pid = g.state.protocols[0].id;
g.performAction({ kind: "SIGN_PROTOCOL", protocolId: pid, nation: "UK" });
g.performAction({ kind: "SIGN_PROTOCOL", protocolId: pid, nation: "SU" });
var p = g.state.protocols[0];
console.log("\u534F\u8BAE\u72B6\u6001:", p.status, "(\u5E94 = SIGNED)");
console.log("\u5DF2\u8FBE\u6210\u76EE\u6807:", JSON.stringify(g.state.achievedGoals));
g.performAction({
  kind: "PROPOSE_PROTOCOL",
  draft: { topic: "UN", title: "\u8054\u5408\u56FD\u5BAA\u7AE0", radicalness: 99, beneficiary: { US: 55, UK: 35, SU: 10 }, signatories: ["US", "UK", "SU"], secret: false },
  proposedBy: "US"
});
var pid2 = g.state.protocols[1].id;
var r1 = g.performAction({ kind: "SIGN_PROTOCOL", protocolId: pid2, nation: "UK" });
console.log("\u82F1\u65B9(\u53CD\u5BF9\u6D3E45\u2192\u4E0A\u965060)\u7B7E\u6FC0\u8FDB\u5EA699:", r1.success, "\u2014", r1.message, "(\u5E94\u5931\u8D25)");
var guard = 0;
while (!g.state.settlement && guard < 200) {
  g.advancePhase();
  guard++;
}
var ser = g.serialize();
console.log("\n=== \u7ED3\u7B97 ===");
console.log("gameEnded:", ser.gameEnded, "| guard:", guard);
console.log("\u7ED3\u5C40:", g.state.settlement?.outcome, "|", g.state.settlement?.endingTitle);
console.log("\u80DC\u5229\u5206:", {
  US: g.state.settlement?.scores.US.victoryScore,
  UK: g.state.settlement?.scores.UK.victoryScore,
  SU: g.state.settlement?.scores.SU.victoryScore
});
console.log("\u7279\u6B8A\u7ED3\u5C40:", g.state.settlement?.specialEndings);
