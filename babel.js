// babel.js - webdeploy build plugin

const Module = require("module");
const { format } = require("util");
const babel = require("@babel/core");

function hijack_plugin_require() {
    const oldfn = Module.prototype.require;

    // Let the babel plugin load our globally-installed babel core.
    Module.prototype.require = function(file) {
        if (file == "@babel/core") {
            return babel;
        }

        return oldfn.apply(this,arguments);
    };

    return oldfn;
}

function restore_plugin_require(fn) {
    Module.prototype.require = fn;
}

async function loadBabelPackage(installer,type,map,plugin) {
    var ref, options;
    if (Array.isArray(plugin)) {
        ref = plugin[0];
        options = plugin[1];
    }
    else {
        ref = plugin;
        options = {};
    }

    // Leave plugin/preset untouched if it is not a string reference.
    if (typeof ref !== 'string') {
        return plugin;
    }

    var prefix = format("%s-",type);

    // Attempt to parse the plugin/preset reference string.
    var match = ref.match(format("^(@[^/]+/)?(%s)?(.+)(@)(.+)$",prefix));
    if (!match) {
        throw new Error(format("Invalid babel plugin reference: %s",ref));
    }

    if (!match[1]) {
        match[1] = '@babel/';
        match[2] = prefix;
    }
    match = match.filter((x) => !!x);
    ref = match.slice(1).join("");

    if (map.has(ref)) {
        return [m.get(ref),options];
    }

    var packageName = match.slice(1,4).join("");
    var packageVersion = match[5];

    var pluginModule = await new Promise((resolve,reject) => {
        installer.installPackage(
            packageName,
            packageVersion,
            (pack) => {
                try {
                    resolve(pack.require());
                } catch (err) {
                    reject(err);
                }
            },
            () => {
                reject(
                    new Error(format("Failed to install Babel package '%s'",packageName))
                );
            },
            reject
        );
    });

    map.set(ref,pluginModule);

    return [pluginModule,options];
}

module.exports = {
    exec: async (target,settings) => {
        // Normalize settings.
        settings.presets = settings.presets || [];
        settings.plugins = settings.plugins || [];

        let code = await target.loadContent();
        let babelOptions = {
            presets: settings.presets,
            plugins: settings.plugins
        };

        let transpilation = babel.transform(code,babelOptions);
        let outputTarget = target.makeOutputTarget();

        outputTarget.stream.end(transpilation.code);

        return outputTarget;
    },

    audit: async (context,settingsList) => {
        if (!settingsList.some((settings) => !!settings.plugins || !!settings.presets)) {
            return;
        }

        let plugins = new Map();
        let presets = new Map();

        let installer = new context.package.NPMPackageInstaller({
            installPath: await context.makeCachePath("modules"),
            logger: context.logger,
            overwrite: false,
            downloadViaNPM: true,

            // Disallow running scripts on Babel plugins when they are
            // installed.
            noscripts: true
        });

        var logged = false;
        installer.once(() => {
            context.log("Installing required babel packages");
            context.beginLog();
            logged = true;
        });

        const oldRequire = hijack_plugin_require();

        // Load plugins and presets. This replaces each string reference with a
        // loaded node module corresponding to the downloaded babel
        // plugin/preset package.
        for (let i = 0;i < settingsList.length;++i) {
            let settings = settingsList[i];

            if (settings.plugins) {
                for (let i = 0;i < settings.plugins.length;++i) {
                    settings.plugins[i] = await loadBabelPackage(
                        installer,
                        'plugin',
                        plugins,
                        settings.plugins[i]
                    );
                }
            }

            if (settings.presets) {
                for (let i = 0;i < settings.presets.length;++i) {
                    settings.presets[i] = await loadBabelPackage(
                        installer,
                        'preset',
                        presets,
                        settings.presets[i]
                    );
                }
            }
        }

        restore_plugin_require(oldRequire);

        if (logged) {
            context.endLog();
        }
    }
};
