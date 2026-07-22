/*:
 * @plugindesc Resolves Foglands card battles into serializable results and timeline events.
 * @author Codex
 *
 * @help
 * Foglands_Combat
 *
 * Public API:
 *   FoglandsCombat.resolve(input) -> result
 *
 * This plugin is a pure combat calculator. It does not access RPG Maker
 * scenes, windows, sprites, maps, or save objects. The caller owns the input
 * and stores the returned result.
 */

(function() {
    'use strict';

    window.FoglandsCombat = window.FoglandsCombat || {};

    var MAX_TURNS = 28;
    var BASE_DRAW = 5;
    var CARDS_USED_PER_TURN = 3;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function copyEffects(effects) {
        return (effects || []).map(function(effect) {
            var copy = {};
            Object.keys(effect).forEach(function(key) {
                copy[key] = effect[key];
            });
            return copy;
        });
    }

    function effectByCode(card, code) {
        return card.effects.filter(function(effect) {
            return effect.code === code;
        })[0] || null;
    }

    function normalizeCard(source) {
        var card = {
            uid: Number(source.uid || 0),
            cardId: Number(source.cardId || 0),
            name: String(source.name || ''),
            category: String(source.category || 'skill'),
            tier: String(source.tier || 'common'),
            animationId: Math.max(0, Number(source.animationId || 0)),
            successRate: Number(source.successRate == null ? 100 : source.successRate),
            upgraded: !!source.upgraded,
            effects: copyEffects(source.effects)
        };

        if (!card.upgraded) return card;

        var wasCertain = card.successRate >= 100;
        if (!wasCertain) card.successRate = Math.min(100, card.successRate + 15);
        var bump = wasCertain ? 3 : 2;
        var primary = effectByCode(card, 'damage');

        if (primary && Number(primary.repeats || 1) > 1) {
            primary.value = Number(primary.value || 0) + 1;
        } else if (primary) {
            primary.value = Number(primary.value || 0) + bump;
        } else if ((primary = effectByCode(card, 'block'))) {
            primary.value = Number(primary.value || 0) + bump;
        } else if ((primary = effectByCode(card, 'blockRetain'))) {
            primary.value = Number(primary.value || 0) + bump;
        } else if ((primary = effectByCode(card, 'blockPerm'))) {
            primary.value = Number(primary.value || 0) + 2;
            primary.cap = Number(primary.cap || 0) + 4;
        } else if ((primary = effectByCode(card, 'heal'))) {
            primary.value = Number(primary.value || 0) + bump;
        } else if ((primary = effectByCode(card, 'poison'))) {
            primary.value = Number(primary.value || 0) + bump;
        } else if ((primary = effectByCode(card, 'drawNext'))) {
            primary.value = Number(primary.value || 0) + 1;
        }

        return card;
    }

    function makeRandom(seed) {
        var value = Number(seed || 1) >>> 0;
        if (!value) value = 1;

        return {
            next: function() {
                value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
                return value / 4294967296;
            },
            integer: function(max) {
                return Math.floor(this.next() * max);
            },
            shuffle: function(items) {
                var result = items.slice();
                for (var i = result.length - 1; i > 0; i--) {
                    var j = this.integer(i + 1);
                    var item = result[i];
                    result[i] = result[j];
                    result[j] = item;
                }
                return result;
            },
            state: function() {
                return value >>> 0;
            }
        };
    }

    function normalizeEnemy(source, index) {
        var maxHp = Math.max(1, Number(source.maxHp || source.hp || 1));
        return {
            instanceId: Number(source.instanceId || index + 1),
            enemyId: Number(source.enemyId || 0),
            name: String(source.name || ('Enemy ' + (index + 1))),
            hp: clamp(Number(source.hp == null ? maxHp : source.hp), 0, maxHp),
            maxHp: maxHp,
            attack: Math.max(0, Number(source.attack || 0)),
            animationId: Math.max(0, Number(source.animationId || 0)),
            poison: Math.max(0, Number(source.poison || 0)),
            defeated: false
        };
    }

    function snapshot(hero, enemies, turnBlock, permanentBlock) {
        return {
            hero: {
                hp: Math.max(0, hero.hp),
                maxHp: hero.maxHp,
                turnBlock: turnBlock,
                permanentBlock: permanentBlock,
                block: turnBlock + permanentBlock
            },
            enemies: enemies.map(function(enemy) {
                return {
                    instanceId: enemy.instanceId,
                    enemyId: enemy.enemyId,
                    name: enemy.name,
                    hp: Math.max(0, enemy.hp),
                    maxHp: enemy.maxHp,
                    poison: enemy.poison,
                    defeated: enemy.hp <= 0
                };
            })
        };
    }

    function firstLivingEnemy(enemies) {
        return enemies.filter(function(enemy) {
            return enemy.hp > 0;
        })[0] || null;
    }

    function allEnemiesDefeated(enemies) {
        return !firstLivingEnemy(enemies);
    }

    FoglandsCombat.resolve = function(input) {
        input = input || {};

        var seed = Number(input.seed || 1) >>> 0;
        var random = makeRandom(seed);
        var heroInput = input.hero || {};
        var hero = {
            actorId: Number(heroInput.actorId || 0),
            name: String(heroInput.name || 'Hero'),
            maxHp: Math.max(1, Number(heroInput.maxHp || heroInput.hp || 1)),
            hp: 0
        };
        hero.hp = clamp(Number(heroInput.hp == null ? hero.maxHp : heroInput.hp), 0, hero.maxHp);

        var enemies = (input.enemies || []).map(normalizeEnemy).filter(function(enemy) {
            return enemy.hp > 0;
        });
        var deck = (input.deck || []).map(normalizeCard);
        var mods = input.mods || {};
        var rules = input.rules || {};
        var maxTurns = Math.max(1, Number(rules.maxTurns || MAX_TURNS));
        var baseDraw = Math.max(1, Number(rules.baseDraw || BASE_DRAW));
        var cardsPerTurn = Math.max(1, Number(rules.cardsPerTurn || CARDS_USED_PER_TURN));

        var timeline = [];
        var turnBlock = 0;
        var permanentBlock = 0;
        var retainNext = 0;
        var pendingDraw = 0;
        var pendingProbability = 0;
        var timeout = false;
        var reason = '';
        var turnNumber = 0;
        var pile = random.shuffle(deck);
        var discard = [];
        var sealedUid = mods.seal && deck.length ? deck[random.integer(deck.length)].uid : null;
        var stats = {
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

        function pushEvent(type, data) {
            var event = data || {};
            event.sequence = timeline.length;
            event.turn = turnNumber;
            event.type = type;
            event.state = snapshot(hero, enemies, turnBlock, permanentBlock);
            timeline.push(event);
        }

        function animationRef(source, targetType, target) {
            var animationId = Math.max(0, Number(source && source.animationId || 0));
            if (!animationId) return null;
            return {
                animationId: animationId,
                targetType: targetType,
                targetId: targetType === 'enemy' ? (target ? target.instanceId : 0) : hero.actorId
            };
        }

        function hpChangeRef(amount, targetType, target) {
            amount = Number(amount || 0);
            if (!amount) return null;
            return {
                amount: amount,
                targetType: targetType,
                targetId: targetType === 'enemy' ? (target ? target.instanceId : 0) : hero.actorId
            };
        }

        function pushActionEvent(type, data, source, targetType, target, hpChange) {
            var animation = animationRef(source, targetType, target);
            var change = hpChangeRef(hpChange, targetType, target);
            if (animation) data.animation = animation;
            if (change) data.hpChange = change;
            pushEvent(type, data);
        }

        function pushHpChangeEvent(type, data, amount, targetType, target) {
            var change = hpChangeRef(amount, targetType, target);
            if (change) data.hpChange = change;
            pushEvent(type, data);
        }

        function reshuffle() {
            pile = random.shuffle(discard);
            discard = [];
            stats.resh++;
            pushEvent('reshuffle', { count: stats.resh });
        }

        function draw(count) {
            var cards = [];
            for (var i = 0; i < count; i++) {
                if (!pile.length) {
                    if (!discard.length) break;
                    reshuffle();
                }
                cards.push(pile.pop());
            }
            return cards;
        }

        function cardRef(card) {
            return {
                uid: card.uid,
                cardId: card.cardId,
                name: card.name,
                category: card.category,
                tier: card.tier,
                animationId: card.animationId,
                upgraded: card.upgraded
            };
        }

        function enemyRef(enemy) {
            if (!enemy) return null;
            return {
                instanceId: enemy.instanceId,
                enemyId: enemy.enemyId,
                name: enemy.name
            };
        }

        function addCategoryAttempt(category, hit) {
            if (!stats.cats[category]) return;
            stats.cats[category].t++;
            if (hit) stats.cats[category].h++;
        }

        function applySuccessfulCard(card, target, hitIndex, hitCount) {
            var execute = effectByCode(card, 'execute');
            var lifesteal = effectByCode(card, 'lifesteal');

            card.effects.forEach(function(effect) {
                var amount;
                if (effect.code === 'damage' && target && target.hp > 0) {
                    amount = Math.max(0, Number(effect.value || 0));
                    if (execute && target.hp <= target.maxHp * Number(execute.threshold || 0.5)) {
                        amount += Number(execute.bonus || 0);
                    }
                    target.hp -= amount;
                    stats.atkHits++;
                    pushActionEvent('damage', {
                        card: cardRef(card),
                        target: enemyRef(target),
                        amount: amount,
                        hit: hitIndex + 1,
                        hits: hitCount
                    }, card, 'enemy', target, -amount);
                    if (lifesteal && amount > 0) {
                        var healed = Math.min(hero.maxHp - hero.hp,
                            Math.floor(amount * Number(lifesteal.rate || 0.5)));
                        hero.hp += healed;
                        pushActionEvent('heal', {
                            card: cardRef(card), amount: healed, source: 'lifesteal'
                        }, card, 'hero', hero, healed);
                    }
                } else if (effect.code === 'block') {
                    amount = Math.max(0, Number(effect.value || 0));
                    turnBlock += amount;
                    pushActionEvent('block', { card: cardRef(card), amount: amount }, card, 'hero', hero);
                } else if (effect.code === 'blockRetain') {
                    amount = Math.max(0, Number(effect.value || 0));
                    turnBlock += amount;
                    retainNext += amount;
                    pushActionEvent('blockRetain', {
                        card: cardRef(card), amount: amount
                    }, card, 'hero', hero);
                } else if (effect.code === 'blockPerm') {
                    var cap = Math.max(0, Number(effect.cap || 0));
                    var before = permanentBlock;
                    permanentBlock = Math.min(cap, permanentBlock + Math.max(0, Number(effect.value || 0)));
                    pushActionEvent('blockPermanent', {
                        card: cardRef(card),
                        amount: permanentBlock - before,
                        total: permanentBlock,
                        cap: cap
                    }, card, 'hero', hero);
                } else if (effect.code === 'heal') {
                    amount = Math.min(hero.maxHp - hero.hp, Math.max(0, Number(effect.value || 0)));
                    hero.hp += amount;
                    pushActionEvent('heal', {
                        card: cardRef(card), amount: amount, source: 'card'
                    }, card, 'hero', hero, amount);
                } else if (effect.code === 'poison' && target && target.hp > 0) {
                    amount = Math.max(0, Number(effect.value || 0));
                    target.poison += amount;
                    pushActionEvent('poisonApplied', {
                        card: cardRef(card),
                        target: enemyRef(target),
                        amount: amount,
                        total: target.poison
                    }, card, 'enemy', target);
                } else if (effect.code === 'poisonDouble' && target && target.hp > 0) {
                    var oldPoison = target.poison;
                    target.poison *= 2;
                    pushActionEvent('poisonDoubled', {
                        card: cardRef(card),
                        target: enemyRef(target),
                        before: oldPoison,
                        total: target.poison
                    }, card, 'enemy', target);
                } else if (effect.code === 'drawNext') {
                    amount = Math.max(0, Number(effect.value || 0));
                    pendingDraw += amount;
                    pushActionEvent('drawNext', {
                        card: cardRef(card), amount: amount
                    }, card, 'hero', hero);
                } else if (effect.code === 'probNext') {
                    amount = Math.max(0, Number(effect.value || 0));
                    pendingProbability = amount;
                    pushActionEvent('probabilityNext', {
                        card: cardRef(card), amount: amount
                    }, card, 'hero', hero);
                }
            });
        }

        pushEvent('battleStart', {
            hero: { actorId: hero.actorId, name: hero.name, hp: hero.hp, maxHp: hero.maxHp },
            enemies: enemies.map(function(enemy) {
                return {
                    instanceId: enemy.instanceId,
                    enemyId: enemy.enemyId,
                    name: enemy.name,
                    hp: enemy.hp,
                    maxHp: enemy.maxHp,
                    attack: enemy.attack
                };
            }),
            deckUids: deck.map(function(card) { return card.uid; })
        });

        if (!deck.length || !enemies.length || hero.hp <= 0) {
            reason = !deck.length ? 'emptyDeck' : (!enemies.length ? 'noEnemies' : 'heroDefeated');
        } else {
            for (turnNumber = 1; turnNumber <= maxTurns; turnNumber++) {
                stats.turns = turnNumber;
                if (turnNumber > 1) {
                    turnBlock = retainNext;
                    retainNext = 0;
                }

                var thorn = 0;
                var probabilityBonus = pendingProbability;
                var drawBonus = pendingDraw;
                pendingProbability = 0;
                pendingDraw = 0;
                var drawCount = (mods.sleep ? 4 : baseDraw) + (mods.morning ? 1 : 0) + drawBonus;
                if (turnNumber === 1) stats.startDraw = drawCount;

                pushEvent('turnStart', {
                    drawCount: drawCount,
                    probabilityBonus: probabilityBonus
                });

                var hand = random.shuffle(draw(drawCount));
                var usedCards = hand.slice(0, cardsPerTurn);
                var unusedCards = hand.slice(cardsPerTurn);
                discard = discard.concat(unusedCards);
                pushEvent('draw', {
                    cards: hand.map(cardRef),
                    usedUids: usedCards.map(function(card) { return card.uid; })
                });

                for (var cardIndex = 0; cardIndex < usedCards.length; cardIndex++) {
                    var card = usedCards[cardIndex];
                    discard.push(card);

                    if (card.uid === sealedUid) {
                        stats.sealed++;
                        pushEvent('cardSealed', { card: cardRef(card) });
                        continue;
                    }

                    if (card.category === 'curse' || card.tier === 'curse' || effectByCode(card, 'fizzle')) {
                        stats.curseFizzle++;
                        pushEvent('curseFizzle', { card: cardRef(card) });
                        continue;
                    }

                    var selfDamage = effectByCode(card, 'selfDamage');
                    if (selfDamage) {
                        var selfAmount = Math.max(0, Number(selfDamage.value || 0));
                        hero.hp -= selfAmount;
                        pushActionEvent('selfDamage', {
                            card: cardRef(card), amount: selfAmount
                        }, card, 'hero', hero, -selfAmount);
                        if (hero.hp <= 0) {
                            reason = 'heroDefeated';
                            break;
                        }
                    }

                    var damageEffect = effectByCode(card, 'damage');
                    var hitCount = damageEffect ? Math.max(1, Number(damageEffect.repeats || 1)) : 1;
                    var effectiveRate = clamp(card.successRate + probabilityBonus, 5, 100);
                    if (mods.blurName && card.name === mods.blurName) {
                        effectiveRate = clamp(effectiveRate - 20, 5, 100);
                    }

                    for (var hitIndex = 0; hitIndex < hitCount; hitIndex++) {
                        var target = firstLivingEnemy(enemies);
                        var roll = random.integer(100) + 1;
                        var success = roll <= effectiveRate;
                        addCategoryAttempt(card.category, success);

                        if (!success) {
                            pushActionEvent('cardMiss', {
                                card: cardRef(card),
                                target: enemyRef(target),
                                hit: hitIndex + 1,
                                hits: hitCount,
                                probability: { effective: effectiveRate, roll: roll }
                            }, card, 'enemy', target);
                            continue;
                        }

                        pushEvent('cardSuccess', {
                            card: cardRef(card),
                            target: enemyRef(target),
                            hit: hitIndex + 1,
                            hits: hitCount,
                            probability: { effective: effectiveRate, roll: roll }
                        });
                        applySuccessfulCard(card, target, hitIndex, hitCount);

                        var thornEffect = effectByCode(card, 'thorn');
                        if (thornEffect) thorn += Math.max(0, Number(thornEffect.value || 0));
                        if (allEnemiesDefeated(enemies)) break;
                    }

                    if (hero.hp <= 0 || allEnemiesDefeated(enemies)) break;
                }

                if (hero.hp <= 0) {
                    reason = 'heroDefeated';
                    break;
                }

                enemies.forEach(function(enemy) {
                    if (enemy.hp > 0 && enemy.poison > 0) {
                        enemy.hp -= enemy.poison;
                        pushHpChangeEvent('poisonTick', {
                            target: enemyRef(enemy),
                            amount: enemy.poison
                        }, -enemy.poison, 'enemy', enemy);
                    }
                });

                if (allEnemiesDefeated(enemies)) {
                    reason = 'enemiesDefeated';
                    break;
                }

                var ramp = Math.floor(Math.min(turnNumber - 1, 7) / 2) +
                    Math.max(0, turnNumber - 8) + Math.max(0, turnNumber - 12);
                var livingEnemies = enemies.filter(function(enemy) { return enemy.hp > 0; });
                for (var enemyIndex = 0; enemyIndex < livingEnemies.length; enemyIndex++) {
                    var attacker = livingEnemies[enemyIndex];
                    var attack = attacker.attack + ramp;
                    var block = turnBlock + permanentBlock;
                    var taken = Math.max(0, attack - block);
                    hero.hp -= taken;
                    pushActionEvent('enemyAttack', {
                        source: enemyRef(attacker),
                        attack: attack,
                        block: block,
                        damage: taken
                    }, attacker, 'hero', hero, -taken);

                    if (thorn > 0 && attacker.hp > 0) {
                        attacker.hp -= thorn;
                        pushHpChangeEvent('thornDamage', {
                            target: enemyRef(attacker),
                            amount: thorn
                        }, -thorn, 'enemy', attacker);
                    }

                    if (hero.hp <= 0) {
                        reason = 'heroDefeated';
                        break;
                    }
                }

                if (hero.hp <= 0 || allEnemiesDefeated(enemies)) {
                    if (!reason) reason = hero.hp <= 0 ? 'heroDefeated' : 'enemiesDefeated';
                    break;
                }

                pushEvent('turnEnd', {});

                if (turnNumber === maxTurns) {
                    timeout = true;
                    hero.hp = 0;
                    reason = 'turnLimit';
                    pushEvent('timeout', { maxTurns: maxTurns });
                    break;
                }
            }
        }

        var victory = allEnemiesDefeated(enemies) && hero.hp > 0;
        var resultName = victory ? 'victory' : (timeout ? 'timeout' : 'defeat');
        pushEvent('battleEnd', { result: resultName, reason: reason });

        return {
            version: 1,
            seed: seed,
            randomState: random.state(),
            outcome: {
                result: resultName,
                victory: victory,
                turns: stats.turns,
                reason: reason
            },
            finalState: snapshot(hero, enemies, turnBlock, permanentBlock),
            stats: stats,
            timeline: timeline
        };
    };
})();
