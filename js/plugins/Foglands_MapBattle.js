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
 * - Player/card action names appear at bottom-left; enemy action names appear
 *   at bottom-right, both with 50-pixel edge margins and no message window.
 * - Action animations and HP popups play before a 30-frame pause advances to
 *   the next action.
 * - Attackers lunge toward targets, hit targets recoil with a red pulse, and
 *   self-buffs pulse blue and play Heal1 at pitch 140.
 * - The hero and every instantiated enemy have HP bars and current/max HP
 *   numbers above their map sprites; both follow choreography and timeline state.
 * - Characters whose HP reaches zero dissolve over 30 frames and remain
 *   hidden for the rest of battle playback.
 * - After playback, the player returns to the origin map and the pre-battle
 *   player/follower formation is restored.
 *
 * A broader battle HUD and post-battle accusation are not implemented yet.
 */

(function() {
    'use strict';

    var pluginName = 'Foglands_MapBattle';
    var params = PluginManager.parameters(pluginName);
    var battleMapId = Number(params['Battle Map Id'] || 2);
    var battleX = Number(params['Battle X'] || 8);
    var battleY = Number(params['Battle Y'] || 6);
    var hpPopupDuration = 30;
    var hpPopupRise = 28;
    var actionPauseFrames = 30;
    var actionLabelMargin = 50;
    var attackMotionFrames = 18;
    var buffGlowFrames = 24;
    var attackLungeDistance = 18;
    var hitRecoilDistance = 10;
    var defeatDissolveFrames = 30;
    var hpBarWidth = 52;
    var hpBarHeight = 7;
    var hpBarBorder = 2;
    var hpBarHeadGap = 8;
    var hpBarTextGap = 6;
    var hpBarTextWidth = 76;
    var hpBarBitmapHeight = 20;

    function Sprite_FoglandsHpChange() {
        this.initialize.apply(this, arguments);
    }

    Sprite_FoglandsHpChange.prototype = Object.create(Sprite.prototype);
    Sprite_FoglandsHpChange.prototype.constructor = Sprite_FoglandsHpChange;

    Sprite_FoglandsHpChange.prototype.initialize = function(character, amount) {
        Sprite.prototype.initialize.call(this);
        this._character = character;
        this._amount = Number(amount || 0);
        this._elapsed = 0;
        this._duration = hpPopupDuration;
        this.bitmap = new Bitmap(160, 64);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.z = 9;
        this.drawValue();
        this.updatePosition();
    };

    Sprite_FoglandsHpChange.prototype.drawValue = function() {
        var context = this.bitmap._context;
        var text = (this._amount > 0 ? '+' : '-') + Math.abs(this._amount);
        var gradient = context.createLinearGradient(0, 10, 0, 54);
        if (this._amount > 0) {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#63cfff');
        } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#f04444');
        }

        context.save();
        context.font = 'bold 30px GameFont';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineJoin = 'round';
        context.strokeStyle = 'rgba(24, 20, 28, 0.9)';
        context.lineWidth = 5;
        context.strokeText(text, 80, 32);
        context.fillStyle = gradient;
        context.fillText(text, 80, 32);
        context.restore();
        this.bitmap._setDirty();
    };

    Sprite_FoglandsHpChange.prototype.updatePosition = function() {
        var progress = Math.min(1, this._elapsed / this._duration);
        this.x = this._character.screenX();
        this.y = this._character.screenY() - 52 - hpPopupRise * progress;
        this.opacity = Math.round(255 * (1 - progress * progress));
    };

    Sprite_FoglandsHpChange.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this._elapsed++;
        this.updatePosition();
        if (this._elapsed >= this._duration && this.parent) {
            this.parent.removeChild(this);
        }
    };

    Sprite_FoglandsHpChange.prototype.isPlaying = function() {
        return this._elapsed < this._duration && !!this.parent;
    };

    function Sprite_FoglandsActionLabel() {
        this.initialize.apply(this, arguments);
    }

    Sprite_FoglandsActionLabel.prototype = Object.create(Sprite.prototype);
    Sprite_FoglandsActionLabel.prototype.constructor = Sprite_FoglandsActionLabel;

    Sprite_FoglandsActionLabel.prototype.initialize = function(text, side) {
        Sprite.prototype.initialize.call(this);
        this._side = side === 'right' ? 'right' : 'left';
        this.bitmap = new Bitmap(Math.max(1, Graphics.boxWidth - actionLabelMargin * 2), 56);
        this.bitmap.fontFace = 'GameFont';
        this.bitmap.fontSize = 28;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.outlineColor = 'rgba(20, 18, 24, 0.9)';
        this.bitmap.outlineWidth = 5;
        this.bitmap.drawText(text, 0, 0, this.bitmap.width, 56, this._side);
        this.anchor.x = this._side === 'right' ? 1 : 0;
        this.anchor.y = 1;
        this.x = this._side === 'right' ?
            Graphics.boxWidth - actionLabelMargin : actionLabelMargin;
        this.y = Graphics.boxHeight - actionLabelMargin;
    };

    function Sprite_FoglandsHpBar() {
        this.initialize.apply(this, arguments);
    }

    Sprite_FoglandsHpBar.prototype = Object.create(Sprite.prototype);
    Sprite_FoglandsHpBar.prototype.constructor = Sprite_FoglandsHpBar;

    Sprite_FoglandsHpBar.prototype.initialize = function(characterSprite, hp, maxHp) {
        Sprite.prototype.initialize.call(this);
        this._characterSprite = characterSprite;
        this._hp = -1;
        this._maxHp = -1;
        var barOuterWidth = hpBarWidth + hpBarBorder * 2;
        var bitmapWidth = barOuterWidth + hpBarTextGap + hpBarTextWidth;
        this.bitmap = new Bitmap(bitmapWidth, hpBarBitmapHeight);
        this.bitmap.fontFace = 'GameFont';
        this.bitmap.fontSize = 16;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.outlineColor = 'rgba(16, 14, 20, 0.95)';
        this.bitmap.outlineWidth = 3;
        this.anchor.x = (barOuterWidth / 2) / bitmapWidth;
        this.anchor.y = 1;
        this.z = 10;
        this.setHp(hp, maxHp);
        this.updatePosition();
    };

    Sprite_FoglandsHpBar.prototype.setHp = function(hp, maxHp) {
        maxHp = Math.max(1, Number(maxHp || 1));
        hp = Math.max(0, Math.min(maxHp, Number(hp || 0)));
        if (this._hp === hp && this._maxHp === maxHp) return;
        this._hp = hp;
        this._maxHp = maxHp;
        this.redraw();
    };

    Sprite_FoglandsHpBar.prototype.redraw = function() {
        var ratio = this._maxHp > 0 ? this._hp / this._maxHp : 0;
        var fillWidth = Math.round(hpBarWidth * ratio);
        var color = ratio > 0.5 ? '#52c77a' : (ratio > 0.25 ? '#e0b84f' : '#e15b5b');
        var barOuterWidth = hpBarWidth + hpBarBorder * 2;
        var barOuterHeight = hpBarHeight + hpBarBorder * 2;
        var barY = Math.floor((hpBarBitmapHeight - barOuterHeight) / 2);
        this.bitmap.clear();
        this.bitmap.fillRect(
            0, barY, barOuterWidth, barOuterHeight, 'rgba(16, 14, 20, 0.9)'
        );
        this.bitmap.fillRect(
            hpBarBorder, barY + hpBarBorder,
            hpBarWidth, hpBarHeight, 'rgba(54, 48, 62, 0.95)'
        );
        if (fillWidth > 0) {
            this.bitmap.fillRect(
                hpBarBorder, barY + hpBarBorder, fillWidth, hpBarHeight, color
            );
        }
        this.bitmap.drawText(
            this._hp + ' / ' + this._maxHp,
            barOuterWidth + hpBarTextGap,
            0,
            hpBarTextWidth,
            hpBarBitmapHeight,
            'left'
        );
    };

    Sprite_FoglandsHpBar.prototype.updatePosition = function() {
        var target = this._characterSprite;
        if (!target) return;
        this.x = target.x;
        this.y = target.y - (target.height || 48) - hpBarHeadGap;
        this.opacity = target.opacity == null ? 255 : target.opacity;
        this.visible = target.visible !== false &&
            (target.opacity == null || target.opacity > 0);
    };

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
                actionName: card.name,
                category: card.category,
                tier: card.tier,
                animationId: Number(card.animationId || 0),
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
                actionName: String(enemy.meta.FogAttackName ||
                    enemy.meta.FogActionName || enemy.name + '의 공격'),
                hp: Number(enemy.params[0] || 1),
                maxHp: Number(enemy.params[0] || 1),
                attack: Number(enemy.params[2] || 0),
                animationId: FoglandsMapBattle.enemyAttackAnimation(enemy)
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
                nextIndex: 0,
                animationPending: false,
                animationEventIndex: -1,
                animationNextIndex: 0,
                valuePopupPending: false,
                choreographyPending: false,
                defeatPending: false,
                actionPending: false,
                pauseFrames: -1
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
        FoglandsMapBattle.clearCombatHpBars();
        FoglandsMapBattle.returnToOrigin();
    };

    FoglandsMapBattle.timelineAnimationTarget = function(animation) {
        if (!animation) return null;
        if (animation.targetType === 'hero') return $gamePlayer;
        if (animation.targetType === 'enemy') {
            return FoglandsMapBattle.enemySlotEvents()[Number(animation.targetId) - 1] || null;
        }
        return null;
    };

    FoglandsMapBattle.timelineCharacterSprite = function(targetRef) {
        var character = FoglandsMapBattle.timelineAnimationTarget(targetRef);
        var scene = SceneManager._scene;
        var sprites = scene && scene._spriteset && scene._spriteset._characterSprites || [];
        return sprites.filter(function(sprite) {
            return sprite && sprite._character === character;
        })[0] || null;
    };

    FoglandsMapBattle.clearCombatHpBars = function() {
        (FoglandsMapBattle._combatHpBars || []).forEach(function(entry) {
            if (entry.sprite && entry.sprite.parent) {
                entry.sprite.parent.removeChild(entry.sprite);
            }
        });
        FoglandsMapBattle._combatHpBars = [];
        FoglandsMapBattle._combatHpBarSeed = 0;
        FoglandsMapBattle._combatHpBarContainer = null;
    };

    FoglandsMapBattle.currentCombatHpSnapshot = function(combat) {
        if (!combat || !combat.input) return null;
        var snapshot = {
            hero: {
                hp: combat.input.hero.hp,
                maxHp: combat.input.hero.maxHp
            },
            enemies: combat.input.enemies.map(function(enemy) {
                return {
                    instanceId: enemy.instanceId,
                    hp: enemy.hp,
                    maxHp: enemy.maxHp
                };
            })
        };
        var timeline = combat.result && combat.result.timeline || [];
        var playback = combat.playback || {};
        var lastIndex = Math.max(-1, Number(playback.index || 0) - 1);
        if (playback.actionPending && playback.animationEventIndex >= 0) {
            lastIndex = playback.animationEventIndex;
        }
        for (var index = 0; index <= lastIndex && index < timeline.length; index++) {
            if (timeline[index] && timeline[index].state) snapshot = timeline[index].state;
        }
        return snapshot;
    };

    FoglandsMapBattle.applyCombatHpSnapshot = function(snapshot) {
        if (!snapshot) return;
        (FoglandsMapBattle._combatHpBars || []).forEach(function(entry) {
            if (entry.targetType === 'hero' && snapshot.hero) {
                entry.sprite.setHp(snapshot.hero.hp, snapshot.hero.maxHp);
            } else if (entry.targetType === 'enemy') {
                var enemy = (snapshot.enemies || []).filter(function(item) {
                    return item.instanceId === entry.targetId;
                })[0];
                if (enemy) entry.sprite.setHp(enemy.hp, enemy.maxHp);
            }
        });
    };

    FoglandsMapBattle.ensureCombatHpBars = function() {
        var state = FoglandsMapBattle.current();
        var combat = state && state.phase === 'combat' && state.combat;
        var scene = SceneManager._scene;
        var spriteset = scene && scene._spriteset;
        var container = spriteset && (spriteset._tilemap || spriteset);
        if (!combat || !combat.input || !container) {
            FoglandsMapBattle.clearCombatHpBars();
            return false;
        }

        var expectedCount = 1 + combat.input.enemies.length;
        if (FoglandsMapBattle._combatHpBarSeed === state.combatSeed &&
                FoglandsMapBattle._combatHpBarContainer === container &&
                (FoglandsMapBattle._combatHpBars || []).length === expectedCount) {
            return true;
        }

        FoglandsMapBattle.clearCombatHpBars();
        var entries = [{
            targetType: 'hero',
            targetId: combat.input.hero.actorId,
            hp: combat.input.hero.hp,
            maxHp: combat.input.hero.maxHp
        }].concat(combat.input.enemies.map(function(enemy) {
            return {
                targetType: 'enemy',
                targetId: enemy.instanceId,
                hp: enemy.hp,
                maxHp: enemy.maxHp
            };
        }));

        FoglandsMapBattle._combatHpBars = entries.map(function(entry) {
            var characterSprite = FoglandsMapBattle.timelineCharacterSprite(entry);
            if (!characterSprite) return null;
            var bar = new Sprite_FoglandsHpBar(characterSprite, entry.hp, entry.maxHp);
            container.addChild(bar);
            return {
                targetType: entry.targetType,
                targetId: entry.targetId,
                sprite: bar
            };
        }).filter(function(entry) {
            return !!entry;
        });
        FoglandsMapBattle._combatHpBarSeed = state.combatSeed;
        FoglandsMapBattle._combatHpBarContainer = container;
        FoglandsMapBattle.applyCombatHpSnapshot(
            FoglandsMapBattle.currentCombatHpSnapshot(combat)
        );
        return FoglandsMapBattle._combatHpBars.length === expectedCount;
    };

    FoglandsMapBattle.updateCombatHpBars = function() {
        (FoglandsMapBattle._combatHpBars || []).forEach(function(entry) {
            var characterSprite = entry.sprite._characterSprite;
            if (entry.sprite._hp <= 0 &&
                    !FoglandsMapBattle.isSpriteDefeatDissolving(characterSprite)) {
                characterSprite.opacity = 0;
            }
            entry.sprite.updatePosition();
        });
    };

    FoglandsMapBattle.setChoreographyPosition = function(sprite, offsetX, offsetY) {
        if (!sprite || !sprite._character) return;
        sprite.x = sprite._character.screenX() + offsetX;
        sprite.y = sprite._character.screenY() + offsetY;
    };

    FoglandsMapBattle.resetChoreographySprite = function(sprite) {
        if (!sprite) return;
        FoglandsMapBattle.setChoreographyPosition(sprite, 0, 0);
        if (sprite.setBlendColor) sprite.setBlendColor([0, 0, 0, 0]);
    };

    FoglandsMapBattle.startTimelineChoreography = function(event) {
        var data = event && event.choreography;
        if (!data) return false;

        var sourceSprite = data.source ?
            FoglandsMapBattle.timelineCharacterSprite(data.source) : null;
        var targetSprite = data.target ?
            FoglandsMapBattle.timelineCharacterSprite(data.target) : null;
        if (data.type === 'attack' && (!sourceSprite || !targetSprite)) return false;
        if ((data.type === 'hit' || data.type === 'buff') && !targetSprite) return false;

        if (data.se && data.se.name) AudioManager.playSe(data.se);
        FoglandsMapBattle._timelineChoreography = {
            data: data,
            sourceSprite: sourceSprite,
            targetSprite: targetSprite,
            elapsed: 0,
            duration: data.type === 'buff' ? buffGlowFrames : attackMotionFrames
        };
        return true;
    };

    FoglandsMapBattle.updateTimelineChoreography = function() {
        var motion = FoglandsMapBattle._timelineChoreography;
        if (!motion) return false;

        motion.elapsed++;
        var progress = Math.min(1, motion.elapsed / motion.duration);
        var pulse = Math.sin(Math.PI * progress);
        var data = motion.data;

        if (data.type === 'attack') {
            var source = motion.sourceSprite._character;
            var target = motion.targetSprite._character;
            var dx = target.screenX() - source.screenX();
            var dy = target.screenY() - source.screenY();
            var length = Math.sqrt(dx * dx + dy * dy) || 1;
            var unitX = dx / length;
            var unitY = dy / length;
            FoglandsMapBattle.setChoreographyPosition(
                motion.sourceSprite,
                unitX * attackLungeDistance * pulse,
                unitY * attackLungeDistance * pulse
            );
            if (data.hit) {
                FoglandsMapBattle.setChoreographyPosition(
                    motion.targetSprite,
                    unitX * hitRecoilDistance * pulse,
                    unitY * hitRecoilDistance * pulse
                );
                motion.targetSprite.setBlendColor([
                    255, 48, 48, Math.round(160 * pulse)
                ]);
            }
        } else if (data.type === 'hit') {
            var fallbackX = data.target.targetType === 'hero' ? -1 : 1;
            FoglandsMapBattle.setChoreographyPosition(
                motion.targetSprite, fallbackX * hitRecoilDistance * pulse, 0
            );
            motion.targetSprite.setBlendColor([255, 48, 48, Math.round(160 * pulse)]);
        } else if (data.type === 'buff') {
            motion.targetSprite.setBlendColor([72, 156, 255, Math.round(150 * pulse)]);
        }

        if (motion.elapsed < motion.duration) return true;
        FoglandsMapBattle.resetChoreographySprite(motion.sourceSprite);
        FoglandsMapBattle.resetChoreographySprite(motion.targetSprite);
        FoglandsMapBattle._timelineChoreography = null;
        return false;
    };

    FoglandsMapBattle.clearTimelineChoreography = function() {
        var motion = FoglandsMapBattle._timelineChoreography;
        if (motion) {
            FoglandsMapBattle.resetChoreographySprite(motion.sourceSprite);
            FoglandsMapBattle.resetChoreographySprite(motion.targetSprite);
        }
        FoglandsMapBattle._timelineChoreography = null;
    };

    FoglandsMapBattle.startTimelineDefeatDissolves = function(event) {
        var motions = (event && event.defeats || []).map(function(targetRef) {
            var sprite = FoglandsMapBattle.timelineCharacterSprite(targetRef);
            if (!sprite) return null;
            return {
                sprite: sprite,
                startOpacity: sprite.opacity == null ? 255 : sprite.opacity
            };
        }).filter(function(motion) {
            return !!motion;
        });
        if (!motions.length) return false;

        FoglandsMapBattle._timelineDefeatDissolves = {
            motions: motions,
            elapsed: 0,
            duration: defeatDissolveFrames
        };
        return true;
    };

    FoglandsMapBattle.updateTimelineDefeatDissolves = function() {
        var dissolve = FoglandsMapBattle._timelineDefeatDissolves;
        if (!dissolve) return false;

        dissolve.elapsed++;
        var progress = Math.min(1, dissolve.elapsed / dissolve.duration);
        dissolve.motions.forEach(function(motion) {
            motion.sprite.opacity = Math.round(motion.startOpacity * (1 - progress));
        });
        if (dissolve.elapsed < dissolve.duration) return true;
        dissolve.motions.forEach(function(motion) {
            motion.sprite.opacity = 0;
        });
        FoglandsMapBattle._timelineDefeatDissolves = null;
        return false;
    };

    FoglandsMapBattle.isSpriteDefeatDissolving = function(sprite) {
        var dissolve = FoglandsMapBattle._timelineDefeatDissolves;
        return !!(dissolve && dissolve.motions.some(function(motion) {
            return motion.sprite === sprite;
        }));
    };

    FoglandsMapBattle.clearTimelineDefeatDissolves = function() {
        var dissolve = FoglandsMapBattle._timelineDefeatDissolves;
        if (dissolve) {
            dissolve.motions.forEach(function(motion) {
                motion.sprite.opacity = 0;
            });
        }
        FoglandsMapBattle._timelineDefeatDissolves = null;
    };

    FoglandsMapBattle.startTimelineAnimation = function(event) {
        var animation = event && event.animation;
        var animationId = Number(animation && animation.animationId || 0);
        if (!animationId || !$dataAnimations[animationId]) return false;

        var target = FoglandsMapBattle.timelineAnimationTarget(animation);
        if (!target || !target.requestAnimation) return false;
        target.requestAnimation(animationId);
        return true;
    };

    FoglandsMapBattle.startTimelineHpChange = function(event) {
        var change = event && event.hpChange;
        var amount = Number(change && change.amount || 0);
        if (!amount) return false;

        var target = FoglandsMapBattle.timelineAnimationTarget(change);
        var scene = SceneManager._scene;
        var spriteset = scene && scene._spriteset;
        var container = spriteset && (spriteset._tilemap || spriteset);
        if (!target || !target.screenX || !target.screenY || !container) return false;

        var popup = new Sprite_FoglandsHpChange(target, amount);
        container.addChild(popup);
        FoglandsMapBattle._timelineHpPopup = popup;
        return true;
    };

    FoglandsMapBattle.isTimelineHpChangePlaying = function() {
        var popup = FoglandsMapBattle._timelineHpPopup;
        if (popup && popup.isPlaying()) return true;
        FoglandsMapBattle._timelineHpPopup = null;
        return false;
    };

    FoglandsMapBattle.timelineActionLabel = function(event) {
        if (!event) return null;
        if (event.type === 'cardSuccess') return null;
        if (event.actionLabel && event.actionLabel.text) return event.actionLabel;
        if (event.card && event.card.name) {
            return {
                text: event.card.name + (event.card.upgraded ? '+' : ''),
                side: 'left'
            };
        }
        if (event.type === 'enemyAttack' && event.source) {
            return { text: event.source.name, side: 'right' };
        }
        if (event.type === 'poisonTick') return { text: '중독', side: 'left' };
        if (event.type === 'thornDamage') return { text: '가시 반사', side: 'left' };
        return null;
    };

    FoglandsMapBattle.startTimelineActionLabel = function(event) {
        var labelData = FoglandsMapBattle.timelineActionLabel(event);
        var scene = SceneManager._scene;
        if (!labelData || !scene || !scene.addChild) return false;

        FoglandsMapBattle.clearTimelineActionLabel();
        var label = new Sprite_FoglandsActionLabel(labelData.text, labelData.side);
        scene.addChild(label);
        FoglandsMapBattle._timelineActionLabel = label;
        return true;
    };

    FoglandsMapBattle.clearTimelineActionLabel = function() {
        var label = FoglandsMapBattle._timelineActionLabel;
        if (label && label.parent) label.parent.removeChild(label);
        FoglandsMapBattle._timelineActionLabel = null;
    };

    FoglandsMapBattle.isTimelineActionEvent = function(event) {
        return !!(FoglandsMapBattle.timelineActionLabel(event) ||
            event && (event.animation || event.hpChange || event.choreography ||
                event.defeats && event.defeats.length));
    };

    FoglandsMapBattle.updateCombatTimeline = function() {
        var state = FoglandsMapBattle.current();
        var combat = state && state.phase === 'combat' && state.combat;
        if (!combat || combat.status !== 'playing' || !combat.result) return;

        var playback = combat.playback || (combat.playback = { index: 0, pending: false, nextIndex: 0 });
        var timeline = combat.result.timeline || [];

        if (playback.pending) {
            playback.index = playback.nextIndex;
            playback.pending = false;
        }

        if (playback.actionPending || playback.animationPending ||
                playback.valuePopupPending || playback.choreographyPending ||
                playback.defeatPending) {
            var animatedEvent = timeline[playback.animationEventIndex];
            var animationTarget = FoglandsMapBattle.timelineAnimationTarget(
                animatedEvent && animatedEvent.animation
            );
            var presentationPlaying = false;
            if (playback.animationPending) {
                if (animationTarget && animationTarget.isAnimationPlaying &&
                        animationTarget.isAnimationPlaying()) {
                    presentationPlaying = true;
                } else {
                    playback.animationPending = false;
                }
            }
            if (playback.valuePopupPending) {
                if (FoglandsMapBattle.isTimelineHpChangePlaying()) {
                    presentationPlaying = true;
                } else {
                    playback.valuePopupPending = false;
                }
            }
            if (playback.choreographyPending) {
                if (FoglandsMapBattle.updateTimelineChoreography()) {
                    presentationPlaying = true;
                } else {
                    playback.choreographyPending = false;
                }
            }
            if (playback.defeatPending) {
                if (FoglandsMapBattle.updateTimelineDefeatDissolves()) {
                    presentationPlaying = true;
                } else {
                    playback.defeatPending = false;
                }
            }
            if (presentationPlaying) return;

            if (playback.pauseFrames == null || playback.pauseFrames < 0) {
                playback.pauseFrames = actionPauseFrames;
            }
            if (playback.pauseFrames > 0) {
                playback.pauseFrames--;
                return;
            }

            FoglandsMapBattle.clearTimelineActionLabel();
            playback.index = playback.animationNextIndex;
            playback.actionPending = false;
            playback.animationEventIndex = -1;
            playback.pauseFrames = -1;
        }

        if (playback.index < timeline.length) {
            var cursor = playback.index;
            var actionEvent = null;
            var eventIndex = -1;
            while (cursor < timeline.length && !actionEvent) {
                eventIndex = cursor;
                if (FoglandsMapBattle.isTimelineActionEvent(timeline[cursor])) {
                    actionEvent = timeline[cursor];
                }
                cursor++;
            }

            if (!actionEvent) {
                playback.index = cursor;
                return;
            }

            FoglandsMapBattle.applyCombatHpSnapshot(actionEvent.state);
            playback.animationPending = FoglandsMapBattle.startTimelineAnimation(actionEvent);
            playback.valuePopupPending = FoglandsMapBattle.startTimelineHpChange(actionEvent);
            playback.choreographyPending =
                FoglandsMapBattle.startTimelineChoreography(actionEvent);
            playback.defeatPending =
                FoglandsMapBattle.startTimelineDefeatDissolves(actionEvent);
            FoglandsMapBattle.startTimelineActionLabel(actionEvent);
            playback.actionPending = true;
            playback.animationEventIndex = eventIndex;
            playback.animationNextIndex = cursor;
            playback.pauseFrames = -1;
            return;
        }

        if (playback.index >= timeline.length) {
            FoglandsMapBattle.clearTimelineActionLabel();
            FoglandsMapBattle.clearTimelineChoreography();
            FoglandsMapBattle.clearTimelineDefeatDissolves();
            FoglandsMapBattle.applyCombatOutcome();
        }
    };

    FoglandsMapBattle.clear = function() {
        FoglandsMapBattle.clearCombatHpBars();
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

    FoglandsMapBattle.enemyAttackAnimation = function(enemy) {
        var meta = enemy && enemy.meta || {};
        return Math.max(0, Number(meta.FogAttackAnimation || meta.FogAnimation || 1));
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
            FoglandsMapBattle.ensureCombatHpBars();
            FoglandsMapBattle.updateCombatTimeline();
            FoglandsMapBattle.updateCombatHpBars();
        }
    };
})();
