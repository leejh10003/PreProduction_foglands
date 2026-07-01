# AGENTS.md

## Project Direction

This is an RPG Maker MV project. The current battle direction is to avoid the default `Scene_Battle` presentation and route battles into a top-view map battle space instead.

The player/hero is the actual combat performer. Companions will eventually act as buffers/promise-givers, not ordinary RPG party actors. Do not push this design back into MV's default actor party, equipment, follower, or battle UI unless explicitly asked.

## Files To Watch

Focus on these files for the current battle prototype:

- `data/FogCards.json`
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

Current battle context shape:

```js
$gameSystem._foglandsMapBattle = {
    active: true,
    troopId: troopId,
    canEscape: Boolean,
    canLose: Boolean,
    source: "event" | "encounter",
    returnState: {
        mapId: Number,
        x: Number,
        y: Number,
        direction: Number
    }
};
```

The helper `FoglandsMapBattle.returnToOrigin()` transfers back to the stored origin and clears this state.

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

Expected future plugin:

- `js/plugins/Foglands_Cards.js`

Expected responsibilities:

- Load `data/FogCards.json` into a global such as `$dataFogCards`.
- Parse card note tags.
- Create runtime card instances.
- Provide helpers for starter deck, reward pools, upgrades, removals, and effect interpretation.

## plugins.js

`js/plugins.js` is generated by RPG Maker MV. Manual edits can be overwritten when the Plugin Manager is saved.

Current relevant plugin order:

1. `MadeWithMv`
2. `ScreenFilter`
3. `Foglands_MapBattle`
4. `Community_Basic`

If `Foglands_MapBattle` appears not to load, check this file first and confirm the plugin is also enabled in MV's Plugin Manager.

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
-> inspect results
-> accuse or skip accusation
-> rewards / penalties / return
```

Post-battle actions are expected to include:

- Review battle results and stats.
- Determine whether promised companion buffs behaved correctly.
- Accuse a suspected betrayer or skip accusation.
- On success, purify the betrayer so their buff works normally later.
- Receive card/reward progression where appropriate.

## Suggested Next Steps

- Add a minimal battle HUD on `Map002`.
- Add a card-selection scene/window before battle resolution, using `data/FogCards.json`.
- Add a temporary "return from battle" command or event that calls `FoglandsMapBattle.returnToOrigin()`.
- Store the instantiated battle enemies in a custom runtime state separate from `$gameTroop`.
- Later, add hero actions and resolve victory/defeat before returning to the origin map.
