# AGENTS.md

## Project Direction

This is an RPG Maker MV project. The current battle direction is to avoid the default `Scene_Battle` presentation and route battles into a top-view map battle space instead.

The player/hero is the actual combat performer. Companions will eventually act as buffers/promise-givers, not ordinary RPG party actors. Do not push this design back into MV's default actor party, equipment, follower, or battle UI unless explicitly asked.

## Files To Watch

Focus on these files for the current battle prototype:

- `data/FogCards.json`
- `js/plugins/Foglands_Cards.js`
- `js/plugins/Foglands_Combat.js`
- `js/plugins/Foglands_MapBattle.js`
- `js/plugins/ScreenFilter.js`
- `js/plugins.js`
- `data/Map002.json`
- `data/Map003.json`

Avoid editing core MV engine files such as `js/rpg_objects.js`, `js/rpg_scenes.js`, `js/rpg_managers.js`, or `js/rpg_sprites.js`. Prefer plugin overrides.

## Foglands_MapBattle.js

`js/plugins/Foglands_MapBattle.js` is the current bridge from default MV battle calls to the top-view battle map.

Current behavior:

- Overrides event command `Battle Processing` (`command301`) so it does not push `Scene_Battle`.
- Overrides random encounter handling on `Scene_Map`.
- Stores battle context in `$gameSystem._foglandsMapBattle`.
- Transfers the player to the configured battle map.
- On battle map start, assigns enemy sprites to tagged map events.
- Opens battle card selection, confirms player/fog picks, and creates the final 10-card deck.
- Calls the pure combat resolver once and stores its complete result in save-backed state.
- Plays structured timeline events through MV's default message window.
- Applies the final hero HP once, reserves transfer to the origin map, and restores the pre-battle player/follower formation after transfer.

Current battle context shape:

```js
$gameSystem._foglandsMapBattle = {
    active: true,
    troopId: troopId,
    canEscape: Boolean,
    canLose: Boolean,
    source: "event" | "encounter",
    phase: "transfer" | "selection" | "combat" | "result" | "returning",
    playerPicks: [cardUid],
    fogPicks: [cardUid],
    battleDeck: [cardUid],
    mods: {},
    combatSeed: Number,
    combat: Object | null,
    returnState: {
        mapId: Number,
        x: Number,
        y: Number,
        direction: Number,
        followersVisible: Boolean,
        followers: [{
            index: Number,
            actorId: Number,
            x: Number,
            y: Number,
            direction: Number
        }]
    }
};
```

`FoglandsMapBattle.runPhase(phase)` is the phase dispatcher. The initial map
transfer resumes into `selection`; confirming a valid card selection snapshots
the player picks, random fog picks, and final 10-card deck, then advances to
`combat`. Entering combat calls `FoglandsCombat.resolve(input)` once, stores the
returned result, and plays its timeline through MV's default message window.

The saved combat state lives at:

```js
$gameSystem._foglandsMapBattle.combat = {
    version: 1,
    status: "playing" | "finished",
    input: {},
    result: {
        outcome: {},
        finalState: {},
        stats: {},
        timeline: []
    },
    playback: {
        index: Number,
        pending: Boolean,
        nextIndex: Number
    },
    outcomeApplied: Boolean
};
```

Do not store authoritative combat progress in plugin-local variables. The
stored result prevents random rolls from changing after a scene recreation or
save load, and `outcomeApplied` prevents HP/results from being applied twice.

## Foglands_Combat.js

`js/plugins/Foglands_Combat.js` is the engine-independent battle calculator.

Public contract:

```js
FoglandsCombat.resolve(input) -> result
```

Current rules:

- Synchronous full-battle resolution, up to 28 turns.
- Draw 5, automatically use 3, discard the rest, and reshuffle as needed.
- Seeded random card order and success rolls.
- Supports all effect codes currently present in `FogCards.json`.
- For multi-enemy Troops, cards target the first living enemy and every living
  enemy attacks in Troop order.
- Returns structured `outcome`, `finalState`, `stats`, and `timeline` data.
- Does not access `$gameSystem`, `$gameMap`, scenes, windows, or sprites.
- Does not retain combat state between calls.

The current input builder uses the party leader's current HP/max HP and MV
Enemy database `params[0]` (HP) / `params[2]` (ATK). Database values are the
active balance source; the prototype scaling formulas are reference material,
not active combat code.

`FoglandsMapBattle.returnToOrigin()` changes the phase to `returning` and
reserves the origin transfer without clearing the battle context. MV's transfer
first synchronizes followers onto the player, so `restoreOriginFormation()`
runs from the destination `Scene_Map.start`, restores saved follower positions,
then clears the battle context. Do not clear it before destination restoration.

### Plugin Parameters

`js/plugins.js` currently registers:

```json
{"name":"Foglands_MapBattle","status":true,"parameters":{"Battle Map Id":"2","Battle X":"4","Battle Y":"13"}}
```

This means battles transfer to `Map002` at `(4, 13)`. If these values are changed in RPG Maker MV's Plugin Manager, `js/plugins.js` will be regenerated.

### Enemy Sprite Mapping

Enemy database records do not have map character sprites by default. The current convention is to add note tags on each enemy:

```text
<FogChar:Monster>
<FogCharIndex:0>
```

`Foglands_MapBattle.js` reads these from `$dataEnemies[enemyId].meta`.

Supported tag names:

- `FogChar` or `FogCharacter`
- `FogCharIndex` or `FogCharacterIndex`

If a troop member is hidden, missing, or lacks these tags, its display slot is made transparent.

## Map002.json

`data/Map002.json` is the current battle map.

It contains pre-placed enemy display slot events. These are intentionally normal MV map events, not dynamically created events.

Enemy slot event convention:

```text
<FogEnemySlot:n>
```

Current slots:

- `FogEnemySlot1` at `(11, 10)`
- `FogEnemySlot2` at `(15, 11)`
- `FogEnemySlot3` at `(13, 12)`
- `FogEnemySlot4` at `(15, 13)`
- `FogEnemySlot5` at `(11, 14)`
- `FogEnemySlot6` at `(13, 15)`

When a troop is routed into the battle map, troop members are assigned to these slots in numeric order.

There is also an `EV007` currently present at `(3, 9)`. Do not assume Map002 only contains enemy slots.

## Map003.json

`data/Map003.json` is the city map (`MapInfos.json` names map 3 as `시가지`). It currently has 27 events and appears to be the main authored map space.

Treat Map003 as user-authored content. Do not rewrite or regenerate it mechanically. If a battle starts from this map, `Foglands_MapBattle` stores the return position before transferring to Map002.

## ScreenFilter.js

`js/plugins/ScreenFilter.js` is a custom screen filter plugin. It supports plugin commands such as:

```text
ScreenFilter on
ScreenFilter off
ScreenFilter contrast 1.25 saturation 0.8 brightness 0.95
ScreenFilter contrast 3 saturation 0.0 brightness 0.95 tintRed 255 tintGreen 220 tintBlue 170 tintStrength 0.7
```

It hooks `Scene_Map.prototype.start` and applies the filter when enabled. `Foglands_MapBattle.js` also hooks `Scene_Map.prototype.start`, so preserve aliasing patterns when editing either plugin:

```js
var _Scene_Map_start = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    // plugin work
};
```

Do not replace `Scene_Map.prototype.start` without calling the previous implementation.

## FogCards.json

`data/FogCards.json` is the new static card database. It intentionally lives in `data/` because cards are game data, analogous to MV's `Skills.json` and `Items.json`, but should not be implemented as either default skills or default items.

Current decision:

- Do not reuse MV `Skill` as the card model.
- Do not reuse MV `Item` as the card model.
- Use a separate Foglands card concept, but keep the data shape familiar to MV.

Why not `Skill`:

- Skills are tied to actors, learned skill lists, MP/TP costs, skill types, and default battle command flow.
- The Foglands card loop needs deck construction, duplicate instances, fog-picked cards, curses, reward pools, upgrades, removals, and custom probability handling.

Why not `Item`:

- Items imply inventory quantity, consumable usage, shop/price behavior, and menu usage.
- Foglands cards are deck/collection instances, not ordinary consumable inventory entries.

Current card database shape:

```js
{
    id: 1,
    key: "old_sword",
    name: "낡은 검",
    description: "피해 5",
    iconIndex: 76,
    animationId: 1,
    category: "attack",
    tier: "common",
    successRate: 100,
    effects: [{ code: "damage", value: 5 }],
    note: "<Starter>"
}
```

Current `data/FogCards.json` contains the prototype card set:

- 55 card definitions total.
- `common`: 34
- `uncommon`: 14
- `mythic`: 6
- `curse`: 1

The file is a static definition table only. Duplicate ownership, upgrades, deck selection, and run state should be stored separately as card instances, for example:

```js
{ uid: 1001, cardId: 1, upgraded: false }
```

Do not add duplicate static definitions just because the starting deck contains multiple copies. Starting deck composition should be represented by multiple runtime instances pointing to the same `cardId`.

Current card plugin:

- `js/plugins/Foglands_Cards.js`

Current responsibilities:

- Load `data/FogCards.json` into a global such as `$dataFogCards`.
- Parse card note tags.
- Provide an MV-window card listing interface.
- Create the prototype starter card collection as runtime instances in `$gameSystem._fogCardInstances`.
- Store selected runtime card uids in `$gameSystem._fogSelectedCardUids`.
- Toggle card selection with OK/Enter in the card list.
- Show selected rows with `(선택)` text.
- Display each row as a card instance, including `#uid`, so duplicate cards are listed separately.
- Enforce `Max Selection` with queue behavior: selecting beyond the cap removes the oldest selected card.
- Reject curse cards from player selection.
- When opened during map-battle `selection`, require 7 player cards (or 6 with `foghand`).
- Provide a battle-only deck confirmation command.
- Preserve the previous valid selection when the battle selection scene is recreated.
- Open the card list with plugin command `FogCards open` or `FogCards list`.
- Clear selection with plugin command `FogCards clear`.
- Reset the starter runtime collection with plugin command `FogCards reset`.

Remaining card-system responsibilities:

- Add acquired reward cards as new runtime instances.
- Provide collection mutation helpers for upgrades and permanent removal.
- Provide reusable reward-pool and collection-query helpers where they belong to card ownership rather than combat resolution.

## plugins.js

`js/plugins.js` is generated by RPG Maker MV. Manual edits can be overwritten when the Plugin Manager is saved.

Current relevant plugin order:

1. `MadeWithMv`
2. `ScreenFilter`
3. `Foglands_Cards`
4. `Foglands_Combat`
5. `Foglands_MapBattle`
6. `Community_Basic`

If combat confirmation only plays the buzzer, check this file first. A missing
or disabled `Foglands_Combat` causes `FoglandsMapBattle.startCombat()` to return
`false`. Because MV regenerates `plugins.js`, register and enable the plugin in
MV's Plugin Manager rather than relying only on a manual edit.

## Implementation Rules

- Keep the default MV battle UI out of the Foglands combat flow.
- Use Troop as encounter composition data.
- Use Enemy note tags for map sprite identity.
- Use pre-placed battle map events as display slots.
- Use `data/FogCards.json` for card definitions instead of MV's default Skill or Item databases.
- Keep static card definitions separate from runtime card instances.
- Do not dynamically create map events unless the user explicitly chooses that direction.
- Do not put companions into `$gameParty` as normal actors for this system yet.
- Prefer data-driven tags and plugin-level state over edits to engine core files.

## Battle Loop Decisions

Recent design decisions after the first map-battle bridge:

- For now, ignore deployed companion implementation and focus on battle triggering into card selection.
- The first interaction after battle trigger should be choosing the player's battle "hand/deck" (`패`) before the actual fight resolves.
- The hero is the combat performer.
- Companions will later be buffers who promise effects. Betrayal means a promised buff is missing or distorted. Purification restores the companion to a normal buffer.
- Combat itself may remain automatic or semi-automatic. The fight is not only a damage exchange; it is also an evidence generator for post-battle betrayal deduction.

Current expected flow:

```text
Map battle trigger
-> store troopId and return position
-> transfer to Map002
-> populate enemy slot events from troop members
-> choose cards / deck / hand
-> resolve top-view battle
-> play timeline in the default message window
-> apply final hero HP
-> reserve return transfer
-> restore player/follower formation on the origin map
-> clear the active battle context
```

The flow above is implemented. The following continuation is planned but not
implemented:

```text
result review
-> accuse or skip accusation
-> purify / apply mythos event
-> reward or penalty
-> return to origin / advance village
```

Post-battle actions are expected to include:

- Review battle results and stats.
- Determine whether promised companion buffs behaved correctly.
- Accuse a suspected betrayer or skip accusation.
- On success, purify the betrayer so their buff works normally later.
- Receive card/reward progression where appropriate.

## Current Implementation Status

### Implemented

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
- Timeline entries display in batches of up to four lines through MV's default message window.
- Final hero HP is applied once and guarded by `outcomeApplied`.
- Player position/direction and visible follower positions/directions are captured before battle transfer.
- Origin transfer keeps the battle context until destination-map formation restoration completes.
- A defeat with `canLose: true` revives dead battle members to 1 HP before return, matching MV's default can-lose behavior.
- A defeat with `canLose: false` restores the origin formation, then MV's normal game-over check proceeds after the return context is cleared.

### Partial

- Battle presentation works as manual message pages, but has no HUD, animation, timed autoplay, speed controls, or instant completion.
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
- Companion roster/deployment, promised buffs, betrayal behavior, and purification.
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
28 turns. It returns structured timeline events; MapBattle currently formats
those events into batches of up to four lines in MV's default message window.

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

**Status: Implemented.** The complete resolved result and message playback cursor are stored under the save-backed map-battle context.

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

**Status: Partial.** Basic message-window playback, final HP application, and origin formation restoration work. Custom viewing controls and post-battle review/reward branches are missing.

The MV implementation currently presents the structured timeline through the
default message window. Custom HUD, automatic timed playback, speed controls,
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

## Suggested Next Steps

Work in this order unless the user explicitly redirects the prototype:

1. Integrate victory/defeat/escape with MV Event Battle Processing branches and define a result review point before or after return.
2. Persist a notebook entry from `combat.result.stats` before the return restoration clears the battle context.
3. Add the three-card reward offer, pity state, and reward acquisition after normal victory.
4. Add the fog-picked-card reveal between deck confirmation and timeline playback.
5. Replace manual message paging with a minimal Map002 battle HUD and timed playback; add speed and instant-complete controls afterward.
6. Add companion promise/buff inputs to the resolver, then betrayal evidence and accusation/purification phases.
7. Add mythos events, card upgrade/removal workflows, curse acquisition controls, and village/run progression.
