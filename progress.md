# progress.md

## Purpose

This file owns time-sensitive project tracking. Keep durable architecture,
contracts, and standing implementation rules in `AGENTS.md`.

## Current Focus

- The top-view map battle core is stable enough for continued feature work.
- The healing-miss target regression is fixed and guarded by automated tests.
- No filesystem debug logging is active during normal battle playback.
- The next product feature is companion actor setup, map recruitment, follower
  formation, and companion combat promises as defined in section 12.

## Planned Post-Battle Flow

```text
result review
-> accuse or skip accusation
-> purify / apply mythos event
-> reward or penalty
-> return to origin / advance village
```

Post-battle work includes:

- Review battle results and persisted statistics.
- Determine whether promised companion buffs behaved correctly.
- Accuse a suspected betrayer or skip accusation.
- Purify a correctly identified betrayer so their buff works normally later.
- Apply card rewards, penalties, and run progression where appropriate.

Remaining card-system work includes:

- Add acquired reward cards as new runtime instances.
- Add collection mutation helpers for upgrades and permanent removal.
- Add reusable reward-pool and collection-query helpers under card ownership,
  rather than combat resolution.

## Verification

Run the combat regression suite with:

```text
node --test test/Foglands_Combat.test.js
```

Current result: 6 tests passed, 0 failed. The suite covers successful healing,
missed healing, missed attacks, multi-effect target intent, deterministic
resolution, input immutability, and the recorded two-bat battle seed.

## Change History

### 2026-08-10

- Selected companion actor setup, map recruitment, follower formation, normal
  combat promises, and corrupted malfunction as the next feature sequence.
- Added the six-stage implementation plan in section 12; purification remains
  deferred to the later post-battle deduction flow.

### 2026-08-08

- Added synchronous JSON Lines diagnostics for skill use and animation target
  requests to `save/FoglandsBattleDebug.log`.
- Reproduced the reported issue: failed `응급 천` actions at timeline
  sequences 17, 28, and 120 requested animation 41 on enemy map events.
- Confirmed that the enemy HP never increased; the defect was incorrect
  presentation metadata on `cardMiss`, not an enemy-healing rule.
- Replaced `cardSuccess`/`cardMiss` probability events with `cardUse` plus
  `successType`.
- Removed effect animation and movement from failed friendly/self-target cards;
  kept attack-card miss lunges without target hit effects.
- Added `test/Foglands_Combat.test.js` using Node's built-in test runner.
- Extracted animation logging into a dedicated function and commented out all
  skill/animation log call sites after diagnosis.

### Earlier Prototype Milestones

- Routed default MV battle processing and random encounters to Map002.
- Added Troop-to-preplaced-event enemy character mapping.
- Added the independent card database, save-backed card instances, and battle
  deck selection.
- Split pure combat resolution from map presentation.
- Added serialized playback, action labels, animations, HP popups,
  choreography, HP bars, defeat dissolves, and return-position restoration.

## Cancelled Or Superseded

- Default `Scene_Battle` presentation is not used for Foglands combat.
- Reusing MV Skills or Items as the Foglands card model was rejected in favor
  of `data/FogCards.json` and runtime card instances.
- Dynamically creating enemy map events was superseded by pre-placed,
  note-tagged enemy slots on Map002.
- Message-window timeline playback was superseded by map labels, choreography,
  animations, HP popups, and timed pauses.
- A presentation-layer animation-target workaround was reverted after logging
  showed that the source `cardMiss` event itself carried the wrong target.
- Filesystem battle diagnostics are disabled, not deleted. Re-enable the
  commented calls only when another target/playback investigation needs them.
- Companion roster/deployment work was previously deferred and is now planned
  as the next product feature in section 12.

## Current Implementation Status

### Implemented

- Card probability attempts now use `type: "cardUse"` with
  `successType: "success" | "miss"`; successful effects retain their own
  `heal`, `block`, `damage`, and related event types.
- Failed healing and other non-attack cards no longer move toward enemies or
  request their configured effect animation. Failed attack cards retain only
  their miss lunge.
- The logged bat-battle regression seed is covered by Node's built-in test
  runner, including the exact former failure sequences 17, 28, and 120.
- Synchronous battle debug logging helpers remain available but all runtime
  call sites are commented out.

- Default MV battle calls route to Map002 instead of `Scene_Battle`.
- Troop members populate pre-tagged enemy slot events using Enemy note tags.
- Card definitions load from `data/FogCards.json` and starter copies exist as save-backed runtime instances.
- Player card selection persists in `$gameSystem`; battle confirmation supports 7/3 and `foghand` 6/4 selection.
- Curse cards are excluded from player picks but remain eligible for fog picks.
- A confirmed 10-card deck is snapshotted into the battle context.
- `FoglandsCombat.resolve(input)` synchronously resolves the automatic battle with seeded randomness.
- Draw/use/discard/reshuffle, probability rolls, the 28-turn limit, enemy attacks, and all current card effect codes are calculated.
- Multi-enemy Troops use first-living-enemy card targeting and Troop-order enemy attacks.
- The resolver returns serializable `outcome`, `finalState`, `stats`, and `timeline` data without mutating its input.
- MapBattle saves the complete input/result/playback state and does not reroll after scene recreation or load.
- Player/card actions show their names at bottom-left; enemy actions show their names at bottom-right, with 50-pixel side and bottom margins.
- The battle playback path does not call MV's message window.
- Card effects and enemy attacks play their configured map-character animations one event at a time.
- Signed HP changes appear above the affected map character, rise a short distance, and fade over 30 frames.
- Attackers lunge 18 pixels toward their targets; hit targets recoil 10 pixels and pulse red before both sprites return to their map positions.
- Friendly self-buffs remain stationary, pulse blue for 24 frames, and play `Heal1` at pitch 140.
- The hero and every instantiated enemy have a compact HP bar with current/max HP text above their head; bars follow choreography and serialized timeline HP.
- A character newly reduced to 0 HP and its HP bar dissolve over 30 frames, then remain hidden until battle playback ends.
- Playback waits another 30 frames after choreography, the action animation, and the HP popup finish before advancing.
- Final hero HP is applied once and guarded by `outcomeApplied`.
- Player position/direction and visible follower positions/directions are captured before battle transfer.
- Origin transfer keeps the battle context until destination-map formation restoration completes.
- A defeat with `canLose: true` revives dead battle members to 1 HP before return, matching MV's default can-lose behavior.
- A defeat with `canLose: false` restores the origin formation, then MV's normal game-over check proceeds after the return context is cleared.

### Partial

- Battle presentation works as one label/choreography/animation/HP-popup/pause step per action event and includes per-character HP bars, but has no broader status HUD, speed controls, or instant completion.
- Victory/defeat/timeout are calculated and return transfer is connected, but no result review screen or custom outcome branch exists.
- `canLose` now controls defeat revival before return; `canEscape` still has no custom escape behavior.
- MV Battle Processing branches are not integrated with the custom result; `command301` currently assigns its branch value at encounter start.
- Enemy HP/ATK come from MV Enemy params and are editable, but broader progression/boss scaling is not defined in code.
- Combat stats are returned, but no persistent notebook/history UI records them.
- Upgrade calculations work when a runtime instance already has `upgraded: true`, but no forge/upgrade workflow sets it yet.
- `seal`, `blurName`, `foghand`, `sleep`, and `morning` are consumed by battle code, but no mythos/event system currently produces and clears them.
- Curse selection and combat fizzle work, but curse acquisition, purge, and three-curse brand filtering do not.

### Not Started

- Fog-picked card reveal screen.
- Post-battle result review flow.
- Reward offer, rarity rolls, pity, and reward acquisition UI.
- Companion actors, map recruitment, follower formation, promised buffs,
  corruption behavior, and purification.
- Accusation/skip accusation and deduction notebook workflow.
- Positive/negative mythos event selection and application.
- Village/boss/run progression and run-clear/death screens.

## Prototype Feature Status

The original HTML prototype defines the following features. Each item is marked
with its current MV implementation status. The code below remains as behavioral
reference, not as an assertion that the feature is still wholly unimplemented.

### 1. Starter Deck Recipe

**Status: Implemented.** Static definitions and the 10 runtime starter instances are both present.

`data/FogCards.json` has static card definitions. `Foglands_Cards.js` now creates the prototype starting collection as runtime instances.

Prototype recipe:

```js
const starterDeck = () => [
  mk("낡은 검", "attack", 100, { dmg: 5 }, "c"),
  mk("낡은 검", "attack", 100, { dmg: 5 }, "c"),
  mk("낡은 검", "attack", 100, { dmg: 5 }, "c"),
  mk("무딘 베기", "attack", 85, { dmg: 7 }, "c"),
  mk("무딘 베기", "attack", 85, { dmg: 7 }, "c"),
  mk("해진 방패", "defense", 100, { block: 4 }, "c"),
  mk("해진 방패", "defense", 100, { block: 4 }, "c"),
  mk("해진 방패", "defense", 100, { block: 4 }, "c"),
  mk("응급 천", "skill", 75, { heal: 3 }, "c"),
  mk("응급 천", "skill", 75, { heal: 3 }, "c")
];
```

Implemented direction: multiple runtime instances point to the relevant
`FogCards.json` `cardId`s. Do not duplicate static card definitions.

Current runtime shape:

```js
{ uid: 1, cardId: 1, upgraded: false }
```

Current storage:

```js
$gameSystem._fogCardInstances
$gameSystem._fogNextCardUid
$gameSystem._fogSelectedCardUids
```

### 2. Battle Card Selection Rules

**Status: Partial.** Selection, confirmation, fog randomization, and persistence work. The separate fog-reveal presentation is missing.

Before battle resolution, the player chooses part of the battle deck and the fog chooses the rest.

Prototype rules:

- Normally player chooses 7 cards.
- Fog chooses 3 cards.
- With `foghand`, player chooses 6 and fog chooses 4.
- Curse cards cannot be chosen by the player.
- Curse cards can be chosen by the fog.
- Previous selection can be reused when still valid.
- Fog-picked cards are revealed before battle starts.

Current MV implementation:

- `FoglandsMapBattle.runPhase("selection")` opens the card selection scene after transfer to Map002.
- Selection is stored in `$gameSystem._fogSelectedCardUids` and survives scene recreation/save-load.
- Confirmation requires the exact player pick count and rejects curse cards.
- The remaining 3 cards (4 with `foghand`) are randomly selected for the fog.
- Confirmed UID arrays are stored as `playerPicks`, `fogPicks`, and `battleDeck` on the battle context.
- The explicit fog-reveal presentation is still pending; the combat resolver is implemented.

Prototype logic:

```js
const freeCount = g => g.nextMods.foghand ? 6 : 7;

const confirmDeck = g => {
  const n = freeCount(g);
  if (g.freePicks.length !== n) return {};
  const rest = g.collection.filter(c => !g.freePicks.includes(c.uid));
  const fog = shuffle(rest).slice(0, 10 - n).map(c => c.uid);
  return { fogPicks: fog, lastPicks: g.freePicks, phase: "fogShow" };
};

const deck = g.collection.filter(c =>
  g.freePicks.includes(c.uid) || g.fogPicks.includes(c.uid)
);
```

### 3. Reward Offer And Pity Rules

**Status: Not Started.** No reward offer, pity state, or reward acquisition flow exists in MV yet.

After a non-boss victory, the prototype offers 3 cards and forces the player to take 1.

Prototype rules:

- Common 66%.
- Uncommon 30%.
- Mythic 4%.
- If pity is 8 or higher and no mythic rolled, force one mythic.
- Avoid duplicate card names within the same offer where possible.
- Reset pity when mythic appears; otherwise increment pity.

Prototype logic:

```js
function rewardOffer(pity) {
  const tiers = [];
  for (let k = 0; k < 3; k++) {
    const r = Math.random();
    tiers.push(r < 0.04 ? "m" : r < 0.34 ? "u" : "c");
  }
  if (pity >= 8 && !tiers.includes("m")) tiers[ri(3)] = "m";

  const used = new Set();
  const cards = [];
  for (const t of tiers) {
    const pool = t === "m" ? POOL_M : t === "u" ? POOL_U : POOL_C;
    let d, tries = 0;
    do { d = pick(pool); tries++; } while (used.has(d[0]) && tries < 30);
    used.add(d[0]);
    cards.push(mk(d[0], d[1], d[2], d[3], t));
  }
  return { cards, hadMyth: tiers.includes("m") };
}
```

### 4. Core Auto-Battle Turn Structure

**Status: Implemented.** The resolver covers the base automatic turn loop and returns a deterministic timeline.

The first MV implementation now resolves the automatic battle and is capped at
28 turns. It returns structured timeline events; MapBattle currently presents
action-bearing events with side labels, sprite choreography, animations, HP
popups, and fixed pauses.

Prototype rules:

- Shuffle selected deck into a draw pile.
- Each turn draws 5 cards by default.
- Use 3 cards; discard the rest.
- Reshuffle discard pile when draw pile is empty.
- Card success is probabilistic.
- Enemy attacks after player cards and poison ticks.
- Turn 28 timeout loses the battle.

Prototype skeleton:

```js
let pile = shuffle(deck), discard = [];

function reshuffle() {
  pile = shuffle(discard);
  discard = [];
  stats.resh++;
}

function draw(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (pile.length === 0) {
      if (discard.length === 0) break;
      reshuffle();
    }
    out.push(pile.pop());
  }
  return out;
}

for (let turn = 1; turn <= 28; turn++) {
  const n = (mods.sleep ? 4 : 5) + (mods.morning ? 1 : 0) + drawBuf;
  const hand = shuffle(draw(n));
  const use = hand.slice(0, 3);
  const rest = hand.slice(3);
  discard.push(...rest);

  for (const card of use) {
    discard.push(card);
    // resolve card
  }

  // poison, enemy attack, timeout checks
}
```

### 5. Enemy Stat Scaling Decision

**Status: Implemented for the current prototype bridge.** Combat reads HP and ATK from MV Enemy params; database tuning is the current balancing mechanism.

The prototype does not use MV enemy params directly. It generates enemy stats from village/battle/boss state.

Prototype logic:

```js
const FOES = {
  1: ["안개 들개", "흐린 그림자", "잿빛 까마귀", "습지 망령", "등 굽은 약탈자"],
  2: ["검은 늑대", "골목의 형체", "녹슨 갑주", "우물 괴이", "등불 도깨비"],
  3: ["목 없는 기수", "재의 무리", "거울 속 사내", "종탑 박쥐 떼", "피리 부는 자"],
  4: ["안개 거인", "이중 그림자", "탑의 감시자", "심연의 손", "이름 없는 것"]
};

const BOSSES = {
  1: "안개의 파수꾼",
  2: "가라앉은 종지기",
  3: "세 그림자의 사제",
  4: "안개의 군주"
};

const makeEnemy = (v, b, boss) => boss
  ? { name: BOSSES[v], hp: 60 + v * 28, maxHp: 60 + v * 28, atk: 7 + v * 2, boss: true }
  : { name: FOES[v][b - 1], hp: 20 + v * 12 + b * 5, maxHp: 20 + v * 12 + b * 5, atk: 5 + v + b, boss: false };
```

The implementation uses MV `Enemy.params` for HP and ATK so authored Troop and
Enemy data control current balance. Prototype formulas remain a reference if a
later progression layer needs derived scaling.

### 6. Battle Runtime State

**Status: Implemented.** The complete resolved result and visual playback cursor are stored under the save-backed map-battle context.

The combat resolver now returns its own result object. MapBattle stores it under
`$gameSystem._foglandsMapBattle.combat`; it remains separate from `$gameTroop`
and map event display slots.

Prototype state values:

```js
let pHp = hp;
let turnBlock = 0;
let permBlock = 0;
let retainNext = 0;
let eHp = enemy.hp;
let poison = 0;
let atkHits = 0;
let dead = false;
let drawBuf = 0;
let probBuf = 0;
let pendDraw = 0;
let pendProb = 0;

const sealedUid = mods.seal && deck.length ? pick(deck).uid : null;
```

Supported battle mods from prototype:

- `seal`
- `blurName`
- `foghand`
- `sleep`
- `morning`

### 7. Combat Log And Notebook Stats

**Status: Partial.** Timeline and base combat stats are returned and saved; notebook entries, history, and deduction UI are missing.

The prototype stores combat events and statistical evidence for deduction. This is central to the game loop.

Prototype stats shape:

```js
const stats = {
  cats: {
    attack: { t: 0, h: 0 },
    defense: { t: 0, h: 0 },
    skill: { t: 0, h: 0 }
  },
  startShield: 0,
  startDraw: 0,
  resh: 0,
  reshShield: 0,
  gambN: 0,
  gambTurns: 0,
  poisN: 0,
  atkHits: 0,
  alch: null,
  sealed: 0,
  curseFizzle: 0,
  turns: 0
};
```

Prototype notebook entry:

```js
const entry = {
  v: g.village,
  b: g.battle,
  boss: g.isBoss,
  comps: [...g.comps],
  stats: sim.stats,
  hpDelta: sim.hpEnd - g.hp
};
```

Current caveat: companion-dependent fields such as `startShield`,
`reshShield`, `gambN`, `poisN`, and `alch` remain zero/null until companion
effects are implemented.

### 8. Negative And Positive Mythos Events

**Status: Not Started as a game phase.** Combat can consume relevant modifier fields, but there is no event selection, application, duration, or cleanup workflow.

The prototype has combat-affecting events after accusation/mythos phases.

Negative events:

```js
const NEG_INFO = {
  erode: { name: "안개의 잠식", desc: "체력 -8" },
  seal: { name: "봉인된 카드", desc: "다음 전투 카드 1장 봉인" },
  blur: { name: "흐려진 시야", desc: "다음 전투 특정 카드 확률 -20%p" },
  foghand: { name: "안개의 손길", desc: "다음 전투 안개가 4장 선택" },
  sleep: { name: "얕은 잠", desc: "다음 전투 매 턴 드로우 4장" },
  brand: { name: "안개의 낙인", desc: "저주 카드 추가" }
};
```

Positive events:

```js
const POS_INFO = {
  heal: { name: "마을의 안도", desc: "체력 16 회복" },
  forge: { name: "대장간 개방", desc: "카드 1장 강화" },
  purge: { name: "기억 정리", desc: "카드 1장 제거" },
  trust: { name: "동료의 신뢰", desc: "동료 능력 1개 강화" },
  morning: { name: "맑은 아침", desc: "다음 전투 드로우 +1" }
};
```

Prototype negative event application:

```js
if (id === "erode") p.hp = Math.max(1, g.hp - 8);
else if (id === "seal") p.nextMods = { ...g.nextMods, seal: true };
else if (id === "blur") p.nextMods = { ...g.nextMods, blurName: c.name };
else if (id === "foghand") p.nextMods = { ...g.nextMods, foghand: true };
else if (id === "sleep") p.nextMods = { ...g.nextMods, sleep: true };
else if (id === "brand") p.collection = [...g.collection, mkCurse()];
```

### 9. Card Upgrade Rules

**Status: Partial.** `Foglands_Combat` applies the prototype upgrade formula when an input card instance has `upgraded: true`; no upgrade acquisition or selection UI exists.

Prototype upgrade behavior:

- If card is not already 100%, increase probability by 15 up to 100.
- If card was already 100%, primary value bump is 3.
- Otherwise primary value bump is 2.
- Multi-hit damage increases per-hit damage by 1.
- Permanent block gains `value +2` and `cap +4`.
- `drawNext` gains 1.

Prototype logic:

```js
function upgradeCard(c) {
  const was100 = c.prob >= 100;
  const n = { ...c, fx: { ...c.fx, ...(c.fx.dmgN ? { dmgN: [...c.fx.dmgN] } : {}) }, up: true };
  if (!was100) n.prob = Math.min(100, c.prob + 15);

  const bump = was100 ? 3 : 2;
  const f = n.fx;
  if (f.dmgN) f.dmgN[0] += 1;
  else if (f.dmg != null) f.dmg += bump;
  else if (f.block != null) f.block += bump;
  else if (f.blockRetain) f.blockRetain += bump;
  else if (f.blockPerm) { f.blockPerm += 2; f.permCap += 4; }
  else if (f.heal != null) f.heal += bump;
  else if (f.pois) f.pois += bump;
  else if (f.drawNext) f.drawNext += 1;
  return n;
}
```

The formula is adapted to the `effects` array in `FogCards.json`. The remaining
work is the persistent forge/upgrade operation that changes a selected runtime
card instance.

### 10. Curse Card Rules

**Status: Partial.** Player exclusion, fog eligibility, combat fizzle, and fizzle stats work. Acquisition, purge, and brand-pool filtering are missing.

The prototype has one curse card: `안개 조각`.

Rules:

- Curse cards are static card definitions but enter the collection as runtime instances.
- Player cannot directly select curse cards.
- Fog can pick curse cards.
- During combat, curse cards fizzle and do nothing.
- Curse fizzle count is recorded in stats.
- If the collection has 3 or more curses, `brand` is removed from the negative event pool.
- Purge can remove curse cards.

Prototype snippets:

```js
const mkCurse = () => mk("안개 조각", "curse", 0, {}, "x");
const isCurse = c => c.tier === "x";

if (card.tier === "x") {
  stats.curseFizzle++;
  log("[안개 조각] — 안개가 손끝에서 흩어진다 (불발)", "miss");
  continue;
}

let ids = [...NEG_IDS];
const curses = g.collection.filter(isCurse).length;
if (curses >= 3) ids = ids.filter(i => i !== "brand");
```

### 11. Battle Viewing UX And Result Branching

**Status: Partial.** Per-event side labels, sprite choreography, map animations, signed HP popups, per-character HP bars, defeat dissolves, fixed pauses, final HP application, and origin formation restoration work. Custom viewing controls and post-battle review/reward branches are missing.

The MV implementation presents action-bearing timeline events without the MV
message window. Friendly action names appear at bottom-left and enemy action
names at bottom-right. Each action can play a map animation and signed HP popup,
plus attack/recoil or buff-glow choreography, then holds for 30 frames before
the next action. Hero and enemy HP bars follow those sprites and update from
timeline snapshots. Characters newly reduced to 0 HP dissolve with their bars
and remain hidden. Non-action events such as turn start and draw remain in the
timeline but are not currently rendered. A broader status HUD, speed controls,
and instant completion remain pending.

Prototype UX:

- Enemy HP bar.
- Player HP bar.
- Current block and poison display.
- Combat log.
- Auto scroll.
- Speed buttons: 400ms, 160ms, 55ms.
- Instant complete.

Prototype branch after battle:

```js
if (!sim.win) return { phase: "dead", hp: 0, notebook };
if (g.isBoss) return { phase: "villageClear", hp: sim.hpEnd, notebook, locked: [], lastBattle };

const offer = rewardOffer(g.pity);
return {
  phase: "reward",
  hp: sim.hpEnd,
  notebook,
  rewards: offer.cards,
  pity: offer.hadMyth ? 0 : g.pity + 1,
  locked: [],
  lastBattle
};
```

Village/run progression from prototype:

- 5 normal battles, then boss.
- Boss victory clears the village.
- Clearing a village reveals missed/found betrayers.
- Moving to the next village heals 30% max HP.
- After village 4, run clear.

### 12. Companion Actors, Map Recruitment, Followers, And Combat Promises

**Status: Not Started.** This section is the next planned product feature.
Implement the normal recruitment and buff path first, then add corrupted
behavior as a separate milestone. Purification remains deferred.

Design reference:

- `C:/Users/LeeJunHyuk/Downloads/foglands_fullrun_demo_v9.html`
- Use the nine companion roles and their three recruitment-dialogue variants
  from the prototype as content reference. The HTML file is not a runtime
  dependency of the MV project.

Implementation work:

1. **Reduce the MV actor database to the hero plus companion slots.**
   - Identify and preserve the current hero actor and its existing references.
   - Remove every other unused default actor from `data/Actors.json` before
     creating companion records.
   - Audit `data/System.json`, event commands, starting-party data, and plugin
     assumptions so no removed actor ID remains referenced accidentally.
   - Keep the hero as the only combat performer; companions must not become
     ordinary attackers, equipment users, or `Scene_Battle` participants.

2. **Create the nine named companion actors and assign stock MV artwork.**
   - Create actors named `점쟁이`, `방패술사`, `음유시인`, `연금술사`,
     `용병`, `사냥꾼`, `수선공`, `도박꾼`, and `독술사`.
   - Visually inspect `img/characters/Actor1.png` through `Actor3.png` and
     select a suitable character-sheet index for each role.
   - Select the matching portrait from `img/faces/Actor1.png` through
     `Actor3.png`; record the chosen sheet name and index so the map sprite and
     face portrait stay paired.
   - Do not overwrite or modify the stock image sheets.

3. **Place recruitable companion events on authored map space.**
   - Inspect map passability and existing events before choosing positions.
   - Place each companion as a normal, pre-created map event in suitable
     walkable areas, initially targeting the city map (`Map003`).
   - Avoid blocking narrow paths, doors, transfers, or existing event routes,
     and do not mechanically regenerate the user-authored map JSON.
   - Give each event stable companion metadata such as
     `<FogCompanion:seer>` rather than identifying it only by event ID.
   - On interaction, present that companion's recruitment dialogue and an
     explicit recruit/cancel choice. Save recruitment state so an already
     recruited companion cannot be added twice.

4. **Implement save-backed recruitment and tail-follower insertion in a new
   companion plugin.**
   - Prefer a plugin such as `js/plugins/Foglands_Companions.js`; do not edit
     MV core engine files.
   - Store stable companion IDs and actor IDs in save-backed state. If MV party
     membership is used to supply follower sprites, isolate that use from the
     Foglands combat roster so only the hero performs combat actions.
   - When recruitment succeeds, refresh the followers and insert the new
     companion at the final visible follower position without disturbing the
     order of companions already following the hero.
   - Place the new tail one tile behind the current chain using the current
     movement/facing direction: down -> north, left -> east, right -> west,
     and up -> south. When followers already exist, derive the insertion point
     from the previous tail and its direction; use a safe fallback when that
     tile is invalid or impassable.
   - Preserve follower order, positions, and directions through save/load,
     transfers, and the existing Map002 battle return-formation workflow.

5. **Implement the nine normal companion promises in combat.**
   - Add normalized companion input to `FoglandsCombat.resolve(input)` and
     keep all authoritative calculations inside the pure seeded resolver.
   - Companions remain buffers; they never replace the hero as the performer.
   - Implement the base prototype values:

   | Companion | Normal promise |
   | --- | --- |
   | 점쟁이 | Attack-card success chance `+20%p` |
   | 방패술사 | Defense-card success chance `+25%p` |
   | 음유시인 | Skill-card success chance `+20%p` |
   | 연금술사 | After victory, `40%` chance to heal hero HP by `12` |
   | 용병 | Gain `8` block at battle start |
   | 사냥꾼 | Draw `1` additional card on the first turn |
   | 수선공 | Gain `5` block on every reshuffle |
   | 도박꾼 | Each turn, `50%` chance to deal `6` extra damage |
   | 독술사 | On a successful hero attack, `30%` chance to add `2` poison |

   - Serialize companion activations, failures, HP changes, and state snapshots
     into the result/timeline so map playback and the future notebook can use
     them without rerolling.
   - Present friendly companion action labels on the left and use the existing
     friendly buff/attack choreography contracts where applicable.
   - Add deterministic resolver tests for every normal promise, including
     multi-enemy targeting and save/replay stability where relevant.
   - This milestone deliberately ignores corruption and purification.

6. **Implement corrupted companion malfunction without purification.**
   - Persist corruption by stable companion ID and pass it into the resolver;
     never infer it from a sprite, actor name, or current follower index.
   - Match the prototype's concealed malfunction rules:
     - Corrupted `점쟁이`, `방패술사`, and `음유시인` still display their
       positive promise, but the real category modifier is inverted to
       `-20%p`, `-25%p`, and `-20%p` respectively.
     - Corrupted `용병`, `사냥꾼`, `수선공`, `도박꾼`, and `독술사` silently
       fail to provide their promised effect.
     - When corrupted `연금술사` successfully procs after victory, the potion
       removes `12` HP instead of healing `12`, without reducing the hero below
       `1` HP.
   - Do not expose corruption directly in recruitment dialogue or the normal
     promise label; evidence should come from serialized combat behavior and
     statistics.
   - Keep seeded rolls deterministic and add paired normal/corrupted regression
     tests for all nine companions.
   - Do not implement accusation, reveal, cleansing, or purification in this
     milestone. Those remain part of the later post-battle deduction flow.

## Suggested Next Steps

Work in this order unless the user explicitly redirects the prototype:

1. Complete section 12 steps 1-4: actor cleanup, companion actor/art setup,
   Map003 recruitment events, and direction-aware tail-follower insertion.
2. Complete section 12 step 5: normal companion promises, serialized timeline
   evidence, presentation, and deterministic tests.
3. Complete section 12 step 6: concealed corrupted behavior and paired
   regression tests; keep purification deferred.
4. Integrate victory/defeat/escape with MV Event Battle Processing branches and define a result review point before or after return.
5. Persist a notebook entry from `combat.result.stats` before the return restoration clears the battle context.
6. Add the three-card reward offer, pity state, and reward acquisition after normal victory.
7. Add the fog-picked-card reveal between deck confirmation and timeline playback.
8. Expand the Map002 HP bars into a broader status HUD around the existing timed action playback; add speed and instant-complete controls afterward.
9. Add betrayal evidence and accusation/purification phases after the corrupted
   companion behavior has produced usable evidence.
10. Add mythos events, card upgrade/removal workflows, curse acquisition controls, and village/run progression.
