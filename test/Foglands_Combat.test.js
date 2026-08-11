'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../js/plugins/Foglands_Combat.js');

const cardDefinitions = require('../data/FogCards.json');

function makeCard(options) {
    return Object.assign({
        uid: 1,
        cardId: 1,
        name: 'Test Card',
        actionName: 'Test Card',
        category: 'skill',
        tier: 'common',
        animationId: 0,
        successRate: 100,
        upgraded: false,
        effects: []
    }, options || {});
}

function makeEnemy(instanceId) {
    return {
        instanceId: instanceId || 1,
        enemyId: 1,
        name: 'Bat',
        actionName: 'Bat Attack',
        hp: 999,
        maxHp: 999,
        attack: 0,
        animationId: 1
    };
}

function makeInput(card, options) {
    options = options || {};
    return {
        seed: options.seed == null ? 1 : options.seed,
        hero: options.hero || {
            actorId: 1,
            name: 'Hero',
            hp: 50,
            maxHp: 100
        },
        enemies: options.enemies || [makeEnemy(1)],
        deck: options.deck || [card],
        mods: options.mods || {},
        rules: options.rules || {
            maxTurns: 1,
            baseDraw: 1,
            cardsPerTurn: 1
        }
    };
}

function resolveSingleCard(card, options) {
    return FoglandsCombat.resolve(makeInput(card, options));
}

function firstEvent(result, predicate) {
    return result.timeline.filter(predicate)[0] || null;
}

function starterDeck() {
    const recipe = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4];
    return recipe.map(function(cardId, index) {
        const definition = cardDefinitions[cardId];
        return {
            uid: index + 1,
            cardId: cardId,
            name: definition.name,
            actionName: definition.name,
            category: definition.category,
            tier: definition.tier,
            animationId: definition.animationId,
            successRate: definition.successRate,
            upgraded: false,
            effects: definition.effects
        };
    });
}

test('successful healing affects only the hero', function() {
    const result = resolveSingleCard(makeCard({
        cardId: 4,
        name: 'Emergency Cloth',
        actionName: 'Emergency Cloth',
        animationId: 41,
        successRate: 100,
        effects: [{ code: 'heal', value: 3 }]
    }));
    const cardUse = firstEvent(result, function(event) {
        return event.type === 'cardUse';
    });
    const heal = firstEvent(result, function(event) {
        return event.type === 'heal';
    });

    assert.equal(cardUse.successType, 'success');
    assert.deepEqual(cardUse.intendedTarget, { targetType: 'hero', targetId: 1 });
    assert.equal(cardUse.animation, undefined);

    assert.equal(heal.successType, 'success');
    assert.deepEqual(heal.animation, {
        animationId: 41,
        targetType: 'hero',
        targetId: 1
    });
    assert.deepEqual(heal.hpChange, {
        amount: 3,
        targetType: 'hero',
        targetId: 1
    });
    assert.equal(heal.state.hero.hp, 53);
    assert.equal(heal.state.enemies[0].hp, 999);
});

test('missed healing has no animation, movement, or HP change', function() {
    const result = resolveSingleCard(makeCard({
        cardId: 4,
        name: 'Emergency Cloth',
        actionName: 'Emergency Cloth',
        animationId: 41,
        successRate: 0,
        effects: [{ code: 'heal', value: 3 }]
    }), { seed: 1 });
    const miss = firstEvent(result, function(event) {
        return event.type === 'cardUse' && event.successType === 'miss';
    });

    assert.ok(miss);
    assert.deepEqual(miss.intendedTarget, { targetType: 'hero', targetId: 1 });
    assert.equal(miss.animation, undefined);
    assert.equal(miss.hpChange, undefined);
    assert.equal(miss.choreography, undefined);
    assert.equal(miss.state.hero.hp, 50);
    assert.equal(miss.state.enemies[0].hp, 999);
    assert.equal(result.timeline.some(function(event) {
        return event.type === 'heal';
    }), false);
});

test('missed attacks lunge without applying a target animation or damage', function() {
    const result = resolveSingleCard(makeCard({
        name: 'Slash',
        actionName: 'Slash',
        category: 'attack',
        animationId: 1,
        successRate: 0,
        effects: [{ code: 'damage', value: 5 }]
    }), { seed: 1 });
    const miss = firstEvent(result, function(event) {
        return event.type === 'cardUse' && event.successType === 'miss';
    });

    assert.ok(miss);
    assert.deepEqual(miss.intendedTarget, { targetType: 'enemy', targetId: 1 });
    assert.equal(miss.animation, undefined);
    assert.equal(miss.hpChange, undefined);
    assert.deepEqual(miss.choreography, {
        type: 'attack',
        source: { targetType: 'hero', targetId: 1 },
        target: { targetType: 'enemy', targetId: 1 },
        hit: false,
        glow: null
    });
    assert.equal(miss.state.enemies[0].hp, 999);
    assert.equal(result.timeline.some(function(event) {
        return event.type === 'damage';
    }), false);
});

test('missed multi-effect cards retain their intended side without effects', function() {
    const cases = [
        {
            name: 'Heal And Block',
            category: 'skill',
            effects: [{ code: 'heal', value: 4 }, { code: 'block', value: 4 }],
            targetType: 'hero'
        },
        {
            name: 'Poison And Block',
            category: 'skill',
            effects: [{ code: 'poison', value: 4 }, { code: 'block', value: 3 }],
            targetType: 'enemy'
        },
        {
            name: 'Block And Counter',
            category: 'defense',
            effects: [{ code: 'block', value: 7 }, { code: 'damage', value: 4 }],
            targetType: 'hero'
        }
    ];

    cases.forEach(function(item, index) {
        const result = resolveSingleCard(makeCard({
            uid: index + 1,
            cardId: index + 1,
            name: item.name,
            actionName: item.name,
            category: item.category,
            animationId: 41,
            successRate: 0,
            effects: item.effects
        }), { seed: 1 });
        const miss = firstEvent(result, function(event) {
            return event.type === 'cardUse' && event.successType === 'miss';
        });

        assert.ok(miss, item.name + ' should miss with seed 1');
        assert.equal(miss.intendedTarget.targetType, item.targetType);
        assert.equal(miss.animation, undefined);
        assert.equal(miss.hpChange, undefined);
        assert.equal(miss.choreography, undefined);
    });
});

test('logged bat battle seed preserves the corrected healing results', function() {
    const enemies = [1, 2].map(function(instanceId) {
        return {
            instanceId: instanceId,
            enemyId: 1,
            name: '박쥐',
            actionName: '박쥐의 공격',
            hp: 37,
            maxHp: 37,
            attack: 7,
            animationId: 1
        };
    });
    const input = makeInput(null, {
        seed: 759550876,
        hero: {
            actorId: 1,
            name: '헤럴드',
            hp: 450,
            maxHp: 450
        },
        enemies: enemies,
        deck: starterDeck(),
        rules: {
            maxTurns: 28,
            baseDraw: 5,
            cardsPerTurn: 3
        }
    });
    const result = FoglandsCombat.resolve(input);
    const emergencyUses = result.timeline.filter(function(event) {
        return event.type === 'cardUse' && event.card && event.card.cardId === 4;
    });
    const misses = emergencyUses.filter(function(event) {
        return event.successType === 'miss';
    });
    const heals = result.timeline.filter(function(event) {
        return event.type === 'heal' && event.card && event.card.cardId === 4;
    });

    assert.deepEqual(misses.map(function(event) {
        return { sequence: event.sequence, turn: event.turn, uid: event.card.uid };
    }), [
        { sequence: 17, turn: 2, uid: 10 },
        { sequence: 28, turn: 3, uid: 10 },
        { sequence: 120, turn: 12, uid: 9 }
    ]);

    misses.forEach(function(event) {
        assert.deepEqual(event.intendedTarget, { targetType: 'hero', targetId: 1 });
        assert.equal(event.animation, undefined);
        assert.equal(event.hpChange, undefined);
        assert.equal(event.choreography, undefined);
    });

    assert.equal(heals.length, 5);
    heals.forEach(function(event) {
        assert.equal(event.successType, 'success');
        assert.equal(event.animation.targetType, 'hero');
        assert.equal(event.animation.targetId, 1);
        if (event.hpChange) {
            assert.equal(event.hpChange.targetType, 'hero');
            assert.equal(event.hpChange.targetId, 1);
            assert.ok(event.hpChange.amount > 0);
        }
    });

    for (let index = 1; index < result.timeline.length; index++) {
        const previous = result.timeline[index - 1].state.enemies;
        const current = result.timeline[index].state.enemies;
        current.forEach(function(enemy, enemyIndex) {
            assert.ok(enemy.hp <= previous[enemyIndex].hp,
                'enemy HP increased at sequence ' + result.timeline[index].sequence);
        });
    }

    assert.equal(result.timeline.some(function(event) {
        return event.type === 'cardMiss' || event.type === 'cardSuccess';
    }), false);
    assert.equal(result.outcome.victory, true);
    assert.equal(result.outcome.turns, 12);
});

test('the same seed and input produce the same combat result without mutation', function() {
    const input = makeInput(makeCard({
        name: 'Deterministic Slash',
        category: 'attack',
        animationId: 1,
        successRate: 50,
        effects: [{ code: 'damage', value: 2 }]
    }), {
        seed: 246813579,
        rules: { maxTurns: 3, baseDraw: 1, cardsPerTurn: 1 }
    });
    const original = JSON.parse(JSON.stringify(input));
    const first = FoglandsCombat.resolve(input);
    const second = FoglandsCombat.resolve(input);

    assert.deepEqual(first, second);
    assert.deepEqual(input, original);
});

test('normalizes companion descriptors by stable id without reordering input', function() {
    const input = makeInput(makeCard({
        uid: 1,
        cardId: 1,
        category: 'skill',
        successRate: 100,
        effects: []
    }), {
        rules: {
            maxTurns: 1,
            baseDraw: 1,
            cardsPerTurn: 1
        }
    });
    input.companions = [
        { companionId: 'bard', actorId: 4, name: '음유시인', deploymentIndex: 9 },
        { companionId: 'seer', actorId: 2, name: '점쟁이', deploymentIndex: 4 },
        { companionId: 'bard', actorId: 4, name: '중복', deploymentIndex: 0 },
        { actorId: 10, name: '식별자 없음' }
    ];
    const originalCompanions = JSON.parse(JSON.stringify(input.companions));

    const result = FoglandsCombat.resolve(input);

    assert.deepEqual(result.stats.companions, [
        {
            companionId: 'bard',
            actorId: 4,
            name: '음유시인',
            deploymentIndex: 0
        },
        {
            companionId: 'seer',
            actorId: 2,
            name: '점쟁이',
            deploymentIndex: 1
        }
    ]);
    assert.deepEqual(input.companions, originalCompanions);
});

test('normal companion category promises raise only their matching card rates', function() {
    [
        ['seer', 'attack', 95],
        ['shield', 'defense', 100],
        ['bard', 'skill', 95]
    ].forEach(function(item, index) {
        const input = makeInput(makeCard({
            uid: index + 1,
            cardId: index + 1,
            category: item[1],
            successRate: 75,
            effects: []
        }), {
            seed: 1,
            rules: { maxTurns: 1, baseDraw: 1, cardsPerTurn: 1 }
        });
        input.companions = [{
            companionId: item[0],
            actorId: index + 2,
            name: item[0]
        }];

        const result = FoglandsCombat.resolve(input);
        const cardUse = firstEvent(result, function(event) {
            return event.type === 'cardUse';
        });

        assert.equal(cardUse.probability.effective, item[2], item[0]);
    });
});

test('normal start, first-draw, and reshuffle promises apply at their timings', function() {
    const startInput = makeInput(makeCard({ effects: [] }), {
        seed: 1,
        rules: { maxTurns: 1, baseDraw: 1, cardsPerTurn: 1 }
    });
    startInput.companions = [
        { companionId: 'merc', actorId: 6, name: '용병' },
        { companionId: 'hunter', actorId: 7, name: '사냥꾼' }
    ];
    const startResult = FoglandsCombat.resolve(startInput);

    assert.equal(startResult.stats.startShield, 8);
    assert.equal(startResult.stats.startDraw, 2);
    assert.equal(startResult.timeline.some(function(event) {
        return event.type === 'block' && event.reason === 'battleStart' &&
            event.companion.companionId === 'merc';
    }), true);
    assert.equal(startResult.timeline.some(function(event) {
        return event.type === 'drawNext' && event.reason === 'firstTurn' &&
            event.companion.companionId === 'hunter';
    }), true);

    const reshuffleInput = makeInput(makeCard({
        effects: [{ code: 'damage', value: 1 }]
    }), {
        seed: 1,
        rules: { maxTurns: 2, baseDraw: 2, cardsPerTurn: 1 }
    });
    reshuffleInput.companions = [{
        companionId: 'tinker',
        actorId: 8,
        name: '수선공'
    }];
    const reshuffleResult = FoglandsCombat.resolve(reshuffleInput);

    assert.equal(reshuffleResult.stats.resh, 1);
    assert.equal(reshuffleResult.stats.reshShield, 5);
    assert.equal(reshuffleResult.timeline.some(function(event) {
        return event.type === 'block' && event.reason === 'reshuffle' &&
            event.companion.companionId === 'tinker';
    }), true);
});

test('normal gambler and poisoner promises use deterministic activation rolls', function() {
    const gamblerInput = makeInput(makeCard({
        category: 'attack',
        effects: [{ code: 'damage', value: 1 }]
    }), { seed: 1 });
    gamblerInput.companions = [{
        companionId: 'gambler',
        actorId: 9,
        name: '도박꾼'
    }];
    const gamblerResult = FoglandsCombat.resolve(gamblerInput);
    const gamblerReplay = FoglandsCombat.resolve(gamblerInput);
    assert.equal(gamblerResult.stats.gambTurns, 1);
    assert.equal(gamblerResult.stats.gambN, 1);
    assert.deepEqual(gamblerReplay, gamblerResult);
    assert.equal(gamblerResult.timeline.some(function(event) {
        return event.type === 'companionExtraAttack' &&
            event.companion.companionId === 'gambler' &&
            event.hpChange.amount === -6;
    }), true);

    const poisonerInput = makeInput(makeCard({
        category: 'attack',
        effects: [{ code: 'damage', value: 1 }]
    }), { seed: 8 });
    poisonerInput.companions = [{
        companionId: 'poisoner',
        actorId: 10,
        name: '독술사'
    }];
    const poisonerResult = FoglandsCombat.resolve(poisonerInput);
    assert.equal(poisonerResult.stats.poisN, 1);
    assert.equal(poisonerResult.timeline.some(function(event) {
        return event.type === 'companionPoison' &&
            event.companion.companionId === 'poisoner' &&
            event.amount === 2;
    }), true);
});

test('normal alchemist promise heals after a seeded victory roll', function() {
    const input = makeInput(makeCard({
        category: 'attack',
        effects: [{ code: 'damage', value: 1 }]
    }), {
        seed: 1,
        hero: { actorId: 1, name: 'Hero', hp: 50, maxHp: 100 },
        enemies: [{
            instanceId: 1,
            enemyId: 1,
            name: 'Bat',
            actionName: 'Bat',
            hp: 1,
            maxHp: 1,
            attack: 0,
            animationId: 0
        }]
    });
    input.companions = [{
        companionId: 'alch',
        actorId: 5,
        name: '연금술사'
    }];

    const result = FoglandsCombat.resolve(input);

    assert.deepEqual(result.stats.alch, {
        activated: true,
        amount: 12,
        roll: 37
    });
    assert.equal(result.finalState.hero.hp, 62);
    assert.equal(result.timeline.some(function(event) {
        return event.type === 'heal' && event.source === 'companion' &&
            event.companion.companionId === 'alch' && event.amount === 12;
    }), true);
});
