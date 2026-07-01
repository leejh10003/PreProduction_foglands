/*:
 * @plugindesc 화면 필터: 대비 / 채도 / 밝기 조절
 * @author Lee, JunHyuk
 *
 * @param Default Contrast
 * @type number
 * @decimals 2
 * @min 0
 * @default 1.00
 * @desc 기본 대비 값. 1.0이 원본입니다.
 *
 * @param Default Saturation
 * @type number
 * @decimals 2
 * @min 0
 * @default 1.00
 * @desc 기본 채도 값. 0이면 흑백, 1.0이 원본입니다.
 *
 * @param Default Brightness
 * @type number
 * @decimals 2
 * @min 0
 * @default 1.00
 * @desc 기본 밝기 값. 1.0이 원본입니다.
 *
 * @param Auto Apply On Map
 * @type boolean
 * @on ON
 * @off OFF
 * @default false
 * @desc 맵 시작 시 자동으로 필터를 적용할지 여부입니다.
 * 
 * @param Tint Red
 * @type number
 * @min 0
 * @max 255
 * @default 0
 * @desc 더할 색조의 Red 값입니다. 0~255.
 *
 * @param Tint Green
 * @type number
 * @min 0
 * @max 255
 * @default 0
 * @desc 더할 색조의 Green 값입니다. 0~255.
 *
 * @param Tint Blue
 * @type number
 * @min 0
 * @max 255
 * @default 0
 * @desc 더할 색조의 Blue 값입니다. 0~255.
 *
 * @param Tint Strength
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.00
 * @desc 색조 강도입니다. 0이면 없음, 1이면 강함.
 *
 * @help
 * Plugin Commands:
 *
 *   ScreenFilter on
 *   ScreenFilter off
 *   ScreenFilter contrast 1.25 saturation 0.8 brightness 0.95
 */

(function() {
    'use strict';

    var pluginName = 'ScreenFilter';
    var parameters = PluginManager.parameters(pluginName);

    var _filterEnabled = false;
    var _contrast = Number(parameters['Default Contrast'] || 1.0);
    var _saturation = Number(parameters['Default Saturation'] || 1.0);
    var _brightness = Number(parameters['Default Brightness'] || 1.0);
    var _autoApply = String(parameters['Auto Apply On Map'] || 'false') === 'true';
    var _tintRed = Number(parameters['Tint Red'] || 0.0);
    var _tintGreen = Number(parameters['Tint Green'] || 0.0);
    var _tintBlue = Number(parameters['Tint Blue'] || 0.0);
    var _tintStrength = Number(parameters['Tint Strength'] || 0.0);

    if (_autoApply) {
        _filterEnabled = true;
    }

    var _filter = null;

    var fragmentSrc =
        'varying vec2 vTextureCoord;\n' +
        'uniform sampler2D uSampler;\n' +
        'uniform float contrast;\n' +
        'uniform float saturation;\n' +
        'uniform float brightness;\n' +
        'uniform vec3 tintColor;\n' +
        'uniform float tintStrength;\n' +
        '\n' +
        'void main(void) {\n' +
        '    vec4 color = texture2D(uSampler, vTextureCoord);\n' +
        '    color.rgb *= brightness;\n' +
        '    color.rgb = (color.rgb - 0.5) * contrast + 0.5;\n' +
        '    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n' +
        '    color.rgb = mix(vec3(gray), color.rgb, saturation);\n' +
        '    color.rgb = mix(color.rgb, color.rgb * tintColor, tintStrength);\n' +
        '    gl_FragColor = color;\n' +
        '}\n';

    function createFilter() {
        _filter = new PIXI.Filter(null, fragmentSrc);
        updateFilterUniforms();
        return _filter;
    }

    function getFilter() {
        if (!_filter) {
            createFilter();
        }
        updateFilterUniforms();
        return _filter;
    }

    function updateFilterUniforms() {
        if (!_filter) return;

        _filter.uniforms.contrast = _contrast;
        _filter.uniforms.saturation = _saturation;
        _filter.uniforms.brightness = _brightness;
        _filter.uniforms.tintColor = [
            _tintRed / 255,
            _tintGreen / 255,
            _tintBlue / 255

        ];
        _filter.uniforms.tintStrength = _tintStrength;
    }

    function targetContainer() {
        var scene = SceneManager._scene;
        if (!scene) return null;

        if (scene._spriteset) return scene._spriteset;
        if (scene._baseSprite) return scene._baseSprite;

        return null;
    }

    function applyFilter() {
        var target = targetContainer();
        if (!target) return;

        var filter = getFilter();

        target.filterArea = new PIXI.Rectangle(0, 0, Graphics.width, Graphics.height);

        var filters = target.filters ? target.filters.slice() : [];

        if (filters.indexOf(filter) === -1) {
            filters.push(filter);
            target.filters = filters;
        }
    }

    function removeFilter() {
        var target = targetContainer();
        if (!target || !target.filters || !_filter) return;

        var filters = target.filters.slice();
        var index = filters.indexOf(_filter);

        if (index !== -1) {
            filters.splice(index, 1);
            target.filters = filters.length > 0 ? filters : null;
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

        if (args[0] === 'on') {
            _filterEnabled = true;
            applyFilter();
            return;
        }

        for (var i = 0; i < args.length; i += 2) {
            var key = args[i];
            var value = Number(args[i + 1]);

            if (key === 'contrast') _contrast = value;
            if (key === 'saturation') _saturation = value;
            if (key === 'brightness') _brightness = value;
            if (key === 'tintRed') _tintRed = value;
            if (key === 'tintGreen') _tintGreen = value;
            if (key === 'tintBlue') _tintBlue = value;
            if (key === 'tintStrength') _tintStrength = value;
        }

        _filterEnabled = true;
        updateFilterUniforms();
        applyFilter();
    };

    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        if (_filterEnabled) {
            applyFilter();
        }
    };
})();