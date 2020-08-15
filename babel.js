// babel.js - webdeploy build plugin

const { format } = require("util");
const babel = require("@babel/core");

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
        return m.get(ref);
    }

    var packageName = match.slice(1,4).join("");
    var packageVersion = match[5];

    var pluginModule = await new Promise((resolve,reject) => {
        installer.installPackage(
            packageName,
            packageVersion,
            (result) => {
                try {
                    resolve(installer.require());
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

    return pluginModule;
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
        let plugins = new Map();
        let presets = new Map();

        let installer = new context.package.NPMPackageInstaller({
            installPath: await context.makeCachePath("modules"),
            logger: context.logger,
            overwrite: false,

            // Disallow running scripts on Babel plugins when they are
            // installed.
            noscripts: true,

            // TODO Allow registries to be configured.
            npmRegistries: [
                'https://registry.npmjs.org/'
            ]
        });

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
    }
};
