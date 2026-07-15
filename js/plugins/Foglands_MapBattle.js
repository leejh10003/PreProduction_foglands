/*:
 * @plugindesc Routes RPG Maker MV battles into a top-view map battle space.
 * @author Codex
 *
 * @param Battle Map Id
 * @type number
 * @min 1
 * @default 2
 *
 * @param Battle X
 * @type number
 * @min 0
 * @default 8
 *
 * @param Battle Y
 * @type number
 * @min 0
 * @default 6
 *
 * @help
 * Foglands_MapBattle
 *
 * This is the first bridge for the Foglands battle flow.
 * It prevents the default Scene_Battle from opening and transfers the
 * player to a configured top-view battle map instead.
 *
 * Current scope:
 * - Event command "Battle Processing" is routed to the battle map.
 * - Random encounters are routed to the battle map.
 * - The triggered troop and return position are stored on $gameSystem.
 * - Enemy slot events tagged with <FogEnemySlot:n> are assigned sprites
 *   from enemy note tags:
 *     <FogChar:Monster>
 *     <FogCharIndex:0>
 * - The battle flow is split into explicit "selection" and "combat" phases.
 * - Confirming card selection stores player picks, fog picks, and the final
 *   battle deck on the saved battle context.
 * - The combat phase calls FoglandsCombat.resolve() once and stores its
 *   serializable result on the battle context.
 * - Timeline events are shown through RPG Maker MV's default message window.
 * - After playback, the player returns to the origin map and the pre-battle
 *   player/follower formation is restored.
 *
 * Visual battle animations and post-battle accusation are not implemented yet.
 */

(function() {
    'use strict';

    var pluginName = 'Foglands_MapBattle';
    var params = PluginManager.parameters(pluginName);
    var battleMapId = Number(params['Battle Map Id'] || 2);
    var battleX = Number(params['Battle X'] || 8);
    var battleY = Number(params['Battle Y'] || 6);

    window.FoglandsMapBattle = window.FoglandsMapBattle || {};

    FoglandsMapBattle.params = function() {
        return {
            battleMapId: battleMapId,
            battleX: battleX,
            battleY: battleY
        };
    };

    FoglandsMapBattle.captureFollowerFormation = function() {
        var formation = [];
        $gamePlayer.followers().forEach(function(follower, index) {
            var actor = follower.actor();
            if (!actor) return;
            formation.push({
                index: index,
                actorId: actor.actorId(),
                x: follower.x,
                y: follower.y,
                direction: follower.direction()
            });
        });
        return formation;
    };

    FoglandsMapBattle.start = function(troopId, canEscape, canLose, source) {
        var returnState = {
            mapId: $gameMap.mapId(),
            x: $gamePlayer.x,
            y: $gamePlayer.y,
            direction: $gamePlayer.direction(),
            followersVisible: $gamePlayer.followers().isVisible(),
            followers: FoglandsMapBattle.captureFollowerFormation()
        };
        $gameSystem._foglandsMapBattle = {
            active: true,
            troopId: troopId,
            canEscape: !!canEscape,
            canLose: !!canLose,
            source: source || 'event',
            returnState: returnState,
            phase: 'transfer',
            playerPicks: [],
            fogPicks: [],
            battleDeck: [],
            mods: {}
        };
        $gamePlayer.makeEncounterCount();
        $gamePlayer.reserveTransfer(battleMapId, battleX, battleY, 2, 0);
    };

    FoglandsMapBattle.current = function() {
        var state = $gameSystem._foglandsMapBattle || null;
        if (state && state.active) {
            if (!state.phase) state.phase = 'transfer';
            if (!state.playerPicks) state.playerPicks = [];
            if (!state.fogPicks) state.fogPicks = [];
            if (!state.battleDeck) state.battleDeck = [];
            if (!state.mods) state.mods = {};
        }
        return state;
    };

    FoglandsMapBattle.requiredPlayerPicks = function() {
        var state = FoglandsMapBattle.current();
        return state && state.mods && state.mods.foghand ? 6 : 7;
    };

    FoglandsMapBattle.requiredFogPicks = function() {
        return 10 - FoglandsMapBattle.requiredPlayerPicks();
    };

    FoglandsMapBattle.shuffle = function(items) {
        var result = items.slice();
        for (var i = result.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var value = result[i];
            result[i] = result[j];
            result[j] = value;
        }
        return result;
    };

    FoglandsMapBattle.confirmCardSelection = function() {
        var state = FoglandsMapBattle.current();
        if (!state || state.phase !== 'selection' || !window.FoglandsCards) return false;

        var required = FoglandsMapBattle.requiredPlayerPicks();
        var playerPicks = FoglandsCards.selectedCardUids();
        if (playerPicks.length !== required) return false;

        var collection = FoglandsCards.collection();
        var selected = {};
        playerPicks.forEach(function(uid) {
            selected[uid] = true;
        });

        var validPlayerPicks = collection.filter(function(instance) {
            return selected[instance.uid] && FoglandsCards.canPlayerSelect(instance);
        }).map(function(instance) {
            return instance.uid;
        });
        if (validPlayerPicks.length !== required) return false;

        var fogPicks = FoglandsMapBattle.shuffle(collection.filter(function(instance) {
            return !selected[instance.uid];
        })).slice(0, FoglandsMapBattle.requiredFogPicks()).map(function(instance) {
            return instance.uid;
        });
        if (fogPicks.length !== FoglandsMapBattle.requiredFogPicks()) return false;

        var battleUids = {};
        validPlayerPicks.concat(fogPicks).forEach(function(uid) {
            battleUids[uid] = true;
        });

        state.playerPicks = validPlayerPicks;
        state.fogPicks = fogPicks;
        state.battleDeck = collection.filter(function(instance) {
            return battleUids[instance.uid];
        }).map(function(instance) {
            return instance.uid;
        });

        return FoglandsMapBattle.runPhase('combat');
    };

    FoglandsMapBattle.makeCombatInput = function() {
        var state = FoglandsMapBattle.current();
        if (!state || !window.FoglandsCards) return null;

        var collectionByUid = {};
        FoglandsCards.collection().forEach(function(instance) {
            collectionByUid[instance.uid] = instance;
        });

        var deck = state.battleDeck.map(function(uid) {
            var instance = collectionByUid[uid];
            var card = instance && FoglandsCards.cardData(instance);
            if (!instance || !card) return null;
            return {
                uid: instance.uid,
                cardId: instance.cardId,
                upgraded: !!instance.upgraded,
                name: card.name,
                category: card.category,
                tier: card.tier,
                successRate: card.successRate,
                effects: card.effects
            };
        }).filter(function(card) {
            return !!card;
        });

        var troop = $dataTroops[state.troopId];
        var enemies = troop ? troop.members.map(function(member, index) {
            var enemy = $dataEnemies[member.enemyId];
            if (!enemy || member.hidden) return null;
            return {
                instanceId: index + 1,
                enemyId: enemy.id,
                name: enemy.name,
                hp: Number(enemy.params[0] || 1),
                maxHp: Number(enemy.params[0] || 1),
                attack: Number(enemy.params[2] || 0)
            };
        }).filter(function(enemy) {
            return !!enemy;
        }) : [];

        var actor = $gameParty.leader();
        if (!actor || deck.length !== 10 || !enemies.length) return null;

        if (!state.combatSeed) {
            state.combatSeed = (Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0;
            if (!state.combatSeed) state.combatSeed = 1;
        }

        return {
            version: 1,
            seed: state.combatSeed,
            hero: {
                actorId: actor.actorId(),
                name: actor.name(),
                hp: actor.hp,
                maxHp: actor.mhp
            },
            enemies: enemies,
            deck: deck,
            mods: state.mods,
            rules: {
                maxTurns: 28,
                baseDraw: 5,
                cardsPerTurn: 3
            }
        };
    };

    FoglandsMapBattle.startCombat = function() {
        var state = FoglandsMapBattle.current();
        if (!state || !window.FoglandsCombat) return false;
        if (state.combat && state.combat.result) return true;

        var input = FoglandsMapBattle.makeCombatInput();
        if (!input) return false;

        state.combat = {
            version: 1,
            status: 'playing',
            input: input,
            result: FoglandsCombat.resolve(input),
            playback: {
                index: 0,
                pending: false,
                nextIndex: 0
            },
            outcomeApplied: false
        };
        return true;
    };

    FoglandsMapBattle.runPhase = function(phase) {
        var state = FoglandsMapBattle.current();
        if (!state || !state.active) return false;

        if (phase === 'selection') {
            state.phase = 'selection';
            state.playerPicks = [];
            state.fogPicks = [];
            state.battleDeck = [];
            state.combat = null;
            state.combatSeed = null;
            if (window.FoglandsCards) {
                FoglandsCards.sanitizeSelection(FoglandsMapBattle.requiredPlayerPicks());
            }
            if (FoglandsMapBattle.isBattleMap() && window.Scene_FogCardList &&
                    SceneManager._scene instanceof Scene_Map && !SceneManager.isSceneChanging()) {
                SceneManager.push(Scene_FogCardList);
            }
            return true;
        }

        if (phase === 'combat') {
            if (!state.battleDeck || state.battleDeck.length !== 10) return false;
            if (!FoglandsMapBattle.startCombat()) return false;
            state.phase = 'combat';
            return true;
        }

        return false;
    };

    FoglandsMapBattle.resumePhase = function() {
        var state = FoglandsMapBattle.current();
        if (!state || !state.active || !FoglandsMapBattle.isBattleMap()) return;

        if (state.phase === 'transfer') {
            FoglandsMapBattle.runPhase('selection');
        } else if (state.phase === 'selection' && window.Scene_FogCardList &&
                SceneManager._scene instanceof Scene_Map && !SceneManager.isSceneChanging()) {
            SceneManager.push(Scene_FogCardList);
        } else if (state.phase === 'combat') {
            FoglandsMapBattle.startCombat();
        }
    };

    FoglandsMapBattle.formatTimelineEvent = function(event) {
        var cardName = event.card ? event.card.name + (event.card.upgraded ? '+' : '') : '';
        var targetName = event.target ? event.target.name : '';
        var heroState = event.state && event.state.hero;
        var targetState = event.state && event.state.enemies.filter(function(enemy) {
            return event.target && enemy.instanceId === event.target.instanceId;
        })[0];

        if (event.type === 'battleStart') {
            return '전투 시작: ' + event.enemies.map(function(enemy) {
                return enemy.name + ' HP ' + enemy.hp + ' / 공격 ' + enemy.attack;
            }).join(', ');
        }
        if (event.type === 'turnStart') {
            return event.turn + '턴 시작 - ' + event.drawCount + '장 드로우';
        }
        if (event.type === 'draw') {
            return '드로우: ' + event.cards.map(function(card) { return card.name; }).join(', ');
        }
        if (event.type === 'reshuffle') return '버림 더미를 다시 섞습니다. (' + event.count + '회)';
        if (event.type === 'cardSealed') return '[' + cardName + '] 봉인되어 불발했습니다.';
        if (event.type === 'curseFizzle') return '[' + cardName + '] 안개 속에서 불발했습니다.';
        if (event.type === 'cardMiss') {
            return '[' + cardName + '] 빗나감 - 확률 ' + event.probability.effective +
                '%, 판정 ' + event.probability.roll;
        }
        if (event.type === 'damage') {
            return '[' + cardName + '] ' + targetName + '에게 피해 ' + event.amount +
                (targetState ? ' (HP ' + targetState.hp + '/' + targetState.maxHp + ')' : '');
        }
        if (event.type === 'selfDamage') {
            return '[' + cardName + '] 자신에게 피해 ' + event.amount +
                (heroState ? ' (HP ' + heroState.hp + '/' + heroState.maxHp + ')' : '');
        }
        if (event.type === 'heal') {
            return '[' + cardName + '] 체력 회복 ' + event.amount +
                (heroState ? ' (HP ' + heroState.hp + '/' + heroState.maxHp + ')' : '');
        }
        if (event.type === 'block') return '[' + cardName + '] 방어막 +' + event.amount;
        if (event.type === 'blockRetain') return '[' + cardName + '] 유지 방어막 +' + event.amount;
        if (event.type === 'blockPermanent') {
            return '[' + cardName + '] 영구 방어막 ' + event.total + '/' + event.cap;
        }
        if (event.type === 'poisonApplied') {
            return '[' + cardName + '] ' + targetName + ' 중독 +' + event.amount + ' (누적 ' + event.total + ')';
        }
        if (event.type === 'poisonDoubled') {
            return '[' + cardName + '] ' + targetName + ' 중독 ' + event.before + ' -> ' + event.total;
        }
        if (event.type === 'drawNext') return '[' + cardName + '] 다음 턴 드로우 +' + event.amount;
        if (event.type === 'probabilityNext') return '[' + cardName + '] 다음 턴 성공률 +' + event.amount + '%p';
        if (event.type === 'poisonTick') {
            return targetName + ' 중독 피해 ' + event.amount +
                (targetState ? ' (HP ' + targetState.hp + '/' + targetState.maxHp + ')' : '');
        }
        if (event.type === 'enemyAttack') {
            return event.source.name + '의 공격 ' + event.attack + ' - 피해 ' + event.damage +
                ', 방어막 ' + event.block +
                (heroState ? ' (HP ' + heroState.hp + '/' + heroState.maxHp + ')' : '');
        }
        if (event.type === 'thornDamage') {
            return targetName + '에게 가시 반사 피해 ' + event.amount +
                (targetState ? ' (HP ' + targetState.hp + '/' + targetState.maxHp + ')' : '');
        }
        if (event.type === 'timeout') return event.maxTurns + '턴 초과 - 안개가 전장을 삼켰습니다.';
        if (event.type === 'battleEnd') {
            if (event.result === 'victory') return '전투 승리!';
            if (event.result === 'timeout') return '전투 패배: 제한 턴을 초과했습니다.';
            return '전투 패배.';
        }
        return null;
    };

    FoglandsMapBattle.applyCombatOutcome = function() {
        var state = FoglandsMapBattle.current();
        var combat = state && state.combat;
        if (!combat || combat.outcomeApplied || !combat.result) return;

        var actor = $gameParty.leader();
        if (actor && combat.result.finalState && combat.result.finalState.hero) {
            actor.setHp(combat.result.finalState.hero.hp);
        }
        combat.outcomeApplied = true;
        combat.status = 'finished';
        state.phase = 'result';

        if (!combat.result.outcome.victory && state.canLose) {
            $gameParty.reviveBattleMembers();
        }
        FoglandsMapBattle.returnToOrigin();
    };

    FoglandsMapBattle.updateCombatTimeline = function() {
        var state = FoglandsMapBattle.current();
        var combat = state && state.phase === 'combat' && state.combat;
        if (!combat || combat.status !== 'playing' || !combat.result) return;

        var playback = combat.playback || (combat.playback = { index: 0, pending: false, nextIndex: 0 });
        var timeline = combat.result.timeline || [];

        if (playback.pending) {
            if ($gameMessage.isBusy()) return;
            playback.index = playback.nextIndex;
            playback.pending = false;
        }

        if (playback.index < timeline.length && !$gameMessage.isBusy()) {
            var cursor = playback.index;
            var lines = [];
            while (cursor < timeline.length && lines.length < 4) {
                var text = FoglandsMapBattle.formatTimelineEvent(timeline[cursor]);
                cursor++;
                if (text) lines.push(text);
            }

            if (!lines.length) {
                playback.index = cursor;
                return;
            }

            $gameMessage.setBackground(0);
            $gameMessage.setPositionType(2);
            lines.forEach(function(line) {
                $gameMessage.add(line);
            });
            playback.pending = true;
            playback.nextIndex = cursor;
            return;
        }

        if (playback.index >= timeline.length && !$gameMessage.isBusy()) {
            FoglandsMapBattle.applyCombatOutcome();
        }
    };

    FoglandsMapBattle.clear = function() {
        $gameSystem._foglandsMapBattle = null;
    };

    FoglandsMapBattle.returnToOrigin = function() {
        var state = FoglandsMapBattle.current();
        if (!state || !state.returnState) return false;
        if (state.phase === 'returning') return true;
        var r = state.returnState;
        state.phase = 'returning';
        $gamePlayer.reserveTransfer(r.mapId, r.x, r.y, r.direction || 2, 0);
        return true;
    };

    FoglandsMapBattle.restoreOriginFormation = function() {
        var state = FoglandsMapBattle.current();
        if (!state || state.phase !== 'returning' || !state.returnState) return false;

        var r = state.returnState;
        if ($gameMap.mapId() !== r.mapId || $gamePlayer.isTransferring()) return false;

        $gamePlayer.setDirection(r.direction || 2);
        if (r.followersVisible === false) {
            $gamePlayer.followers().hide();
        } else if (r.followersVisible === true) {
            $gamePlayer.followers().show();
        }

        var currentFollowers = [];
        $gamePlayer.followers().forEach(function(follower, index) {
            var actor = follower.actor();
            currentFollowers.push({
                index: index,
                actorId: actor ? actor.actorId() : 0,
                follower: follower
            });
        });

        var usedIndexes = {};
        (r.followers || []).forEach(function(saved) {
            var match = currentFollowers.filter(function(current) {
                return !usedIndexes[current.index] && saved.actorId && current.actorId === saved.actorId;
            })[0];
            if (!match) {
                match = currentFollowers.filter(function(current) {
                    return !usedIndexes[current.index] && current.index === saved.index;
                })[0];
            }
            if (!match) return;

            usedIndexes[match.index] = true;
            match.follower.locate(saved.x, saved.y);
            match.follower.setDirection(saved.direction || 2);
        });

        $gamePlayer.followers()._gathering = false;
        FoglandsMapBattle.clear();
        return true;
    };

    FoglandsMapBattle.isBattleMap = function() {
        return $gameMap && $gameMap.mapId && $gameMap.mapId() === battleMapId;
    };

    FoglandsMapBattle.enemySprite = function(enemyId) {
        var enemy = $dataEnemies[enemyId];
        if (!enemy || !enemy.meta) return null;

        var characterName = enemy.meta.FogChar || enemy.meta.FogCharacter;
        var characterIndex = Number(enemy.meta.FogCharIndex || enemy.meta.FogCharacterIndex || 0);
        if (!characterName) return null;

        return {
            characterName: characterName,
            characterIndex: characterIndex
        };
    };

    FoglandsMapBattle.enemySlotEvents = function() {
        return $gameMap.events().filter(function(event) {
            return event && event.event() && event.event().meta && event.event().meta.FogEnemySlot;
        }).sort(function(a, b) {
            return Number(a.event().meta.FogEnemySlot) - Number(b.event().meta.FogEnemySlot);
        });
    };

    FoglandsMapBattle.clearEnemySlot = function(event) {
        event.setImage('', 0);
        event.setTransparent(true);
    };

    FoglandsMapBattle.applyEnemySlot = function(event, member) {
        if (!member || member.hidden) {
            FoglandsMapBattle.clearEnemySlot(event);
            return;
        }

        var sprite = FoglandsMapBattle.enemySprite(member.enemyId);
        if (!sprite) {
            FoglandsMapBattle.clearEnemySlot(event);
            return;
        }

        event.setImage(sprite.characterName, sprite.characterIndex);
        event.setDirection(2);
        event.setPattern(1);
        event.setTransparent(false);
    };

    FoglandsMapBattle.setupEnemySlots = function() {
        if (!FoglandsMapBattle.isBattleMap()) return;

        var state = FoglandsMapBattle.current();
        var troop = state && $dataTroops[state.troopId];
        var members = troop ? troop.members : [];
        var slots = FoglandsMapBattle.enemySlotEvents();

        slots.forEach(function(event, index) {
            FoglandsMapBattle.applyEnemySlot(event, members[index]);
        });
    };

    // Battle Processing
    Game_Interpreter.prototype.command301 = function() {
        if (!$gameParty.inBattle()) {
            var troopId;
            if (this._params[0] === 0) {
                troopId = this._params[1];
            } else if (this._params[0] === 1) {
                troopId = $gameVariables.value(this._params[1]);
            } else {
                troopId = $gamePlayer.makeEncounterTroopId();
            }
            if ($dataTroops[troopId]) {
                this._branch[this._indent] = 0;
                FoglandsMapBattle.start(troopId, this._params[2], this._params[3], 'event');
            }
        }
        return true;
    };

    Scene_Map.prototype.updateEncounter = function() {
        if (!$gameMap.isEventRunning() && $gamePlayer._encounterCount <= 0) {
            $gamePlayer.makeEncounterCount();
            var troopId = $gamePlayer.makeEncounterTroopId();
            if ($dataTroops[troopId]) {
                BattleManager.onEncounter();
                FoglandsMapBattle.start(troopId, true, false, 'encounter');
            }
        }
    };

    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        FoglandsMapBattle.restoreOriginFormation();
        FoglandsMapBattle.setupEnemySlots();
        FoglandsMapBattle.resumePhase();
    };

    var _Scene_Map_checkGameover = Scene_Map.prototype.checkGameover;
    Scene_Map.prototype.checkGameover = function() {
        var state = FoglandsMapBattle.current();
        if (state && state.active && state.phase === 'returning') return;
        _Scene_Map_checkGameover.call(this);
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (FoglandsMapBattle.isBattleMap()) {
            FoglandsMapBattle.updateCombatTimeline();
        }
    };
})();
