/*:
 * @plugindesc Simple contrast / saturation / brightness filter for RPG Maker MV
 * @author ChatGPT
 *
 * @help
 * Plugin Commands:
 *
 * ScreenFilter contrast 1.25 saturation 0.8 brightness 0.95
 * ScreenFilter off
 */

(function() {
    var _filterEnabled = false;
    var _contrast = 1.0;
    var _saturation = 1.0;
    var _brightness = 1.0;
    var _filter = null;

    var fragmentSrc =
        'varying vec2 vTextureCoord;\n' +
        'uniform sampler2D uSampler;\n' +
        'uniform float contrast;\n' +
        'uniform float saturation;\n' +
        'uniform float brightness;\n' +
        '\n' +
        'void main(void) {\n' +
        '    vec4 color = texture2D(uSampler, vTextureCoord);\n' +
        '    color.rgb *= brightness;\n' +
        '    color.rgb = (color.rgb - 0.5) * contrast + 0.5;\n' +
        '    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n' +
        '    color.rgb = mix(vec3(gray), color.rgb, saturation);\n' +
        '    gl_FragColor = color;\n' +
        '}\n';

    function createFilter() {
        _filter = new PIXI.Filter(null, fragmentSrc);
        _filter.uniforms.contrast = _contrast;
        _filter.uniforms.saturation = _saturation;
        _filter.uniforms.brightness = _brightness;
        return _filter;
    }

    function getFilter() {
        if (!_filter) {
            createFilter();
        }

        _filter.uniforms.contrast = _contrast;
        _filter.uniforms.saturation = _saturation;
        _filter.uniforms.brightness = _brightness;

        return _filter;
    }

    function targetContainer() {
        var scene = SceneManager._scene;
        if (!scene) return null;

        // 맵 화면에 적용
        if (scene._spriteset) return scene._spriteset;

        // 혹시 다른 씬이면 베이스 스프라이트
        if (scene._baseSprite) return scene._baseSprite;

        return null;
    }

    function applyFilter() {
        var target = targetContainer();
        if (!target) return;

        var filter = getFilter();

        if (!target.filters) {
            target.filters = [];
        }

        if (target.filters.indexOf(filter) < 0) {
            target.filters.push(filter);
        }
    }

    function removeFilter() {
        var target = targetContainer();
        if (!target || !target.filters) return;

        target.filters = target.filters.filter(function(f) {
            return f !== _filter;
        });

        if (target.filters.length === 0) {
            target.filters = null;
        }
    }

    var _Game_Interpreter_pluginCommand =
        Game_Interpreter.prototype.pluginCommand;

    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (command !== 'ScreenFilter') return;

        if (args[0] === 'off') {
            _filterEnabled = false;
            removeFilter();
            return;
        }

        for (var i = 0; i < args.length; i += 2) {
            var key = args[i];
            var value = Number(args[i + 1]);

            if (key === 'contrast') _contrast = value;
            if (key === 'saturation') _saturation = value;
            if (key === 'brightness') _brightness = value;
        }

        _filterEnabled = true;
        applyFilter();
    };

    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        if (_filterEnabled) {
            applyFilter();
        }
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (_filterEnabled) {
            applyFilter();
        }
    };
})();