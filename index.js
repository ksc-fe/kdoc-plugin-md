const marked = require("marked");
const highlight = require("highlight.js");
const yaml = require("js-yaml");
const renderer = new marked.Renderer();
const codeRenderer = renderer.code;
const path = require("path");
const crypto = require("crypto");
const hash = crypto.createHash("md5");

const parsingYaml = function(contents) {
    const result = {};
    result.content = contents.replace(/---\s*[\n\r]+\s*((?:.|\n|\r)*?)[\n\r]+---/, function(
        all,
        matched
    ) {
        result.setting = yaml.safeLoad(matched);
        return "";
    });
    return result;
};

module.exports = async function(ctx) {
    async function requireCss(_path) {
        let style = "";
        try {
            style = await ctx.fs.readFile(
                path.resolve(__dirname, `./node_modules/${_path}`)
            );
        } catch (error) {
            try {
                style = await ctx.fs.readFile(
                    path.resolve(__dirname, "../", `./node_modules/${_path}`)
                );
            } catch (error) {}
        }
        return style;
    }
    const hljsStyle = await requireCss("highlight.js/styles/dracula.css");
    ctx.data.mdHljsStyle = hljsStyle.toString();
    ctx.hook.add("pipe", function(file) {
        const codes = [];
        let contents = file.contents.toString();
        //解析yaml
        const parsed = parsingYaml(contents);
        contents = parsed.content;
        let setting = parsed.setting;
        let catalogs = [];
        renderer.heading = function(text, level, raw) {
            const id = this.options.headerPrefix
                ? `${this.options.headerPrefix}-${encodeURIComponent(raw)}`
                : encodeURIComponent(raw);
            let result = `<h${level} id='${id}'>${text}</h${level}>`;
            catalogs.push({
                text: text,
                level: level,
                id: id,
                content: result
            });
            return result;
        };
        const exampleReg = /^(example-)/;
        renderer.code = function(code, language) {
            if (language === "example") {
                language = "example-js";
            }
            let result = codeRenderer.call(this, code, language);
            if (exampleReg.test(language)) {
                language = language.replace(exampleReg, "");
                // hash.update(code);
                // const id = hash.digest("hex");
                codes.push({
                    language: language,
                    content: code,
                    example: true,
                });
                result = `<!-- example -->`;
            } else {
                codes.push({
                    language: language,
                    content: code
                });
            }

            return result;
        };

        ctx.hook.run('md.renderer', ctx, renderer, file, codes);

        contents = marked(contents, {
            renderer: renderer,
            langPrefix: "hljs ",
            headerPrefix: "header",
            highlight: function(code) {
                return highlight.highlightAuto(code).value;
            }
        });
        file.md = {
            source: file.contents,
            setting: setting,
            catalogs: catalogs,
            contents: contents,
            codes: codes
        };
        file.contents = null;
    });

    ctx.hook.add('dist.before', async function(files) {
        const hljsStyle = ctx.data.mdHljsStyle;
        const hljscss = "hljs.css";
        if (hljsStyle) {
            ctx.fsWrite(path.join(ctx.data.output, hljscss), hljsStyle);
        }
        await getSideBar(ctx);
    });
};

function catalogsTree(catalogs) {
    let tree = [];

    while (catalogs.length) {
        const catalog = catalogs.shift();
        if (catalog.level === 1) {
            tree.push({
                title: catalog.text,
                path: `#${catalog.id}`,
                level: catalog.level,
                content: catalog.content,
                text: catalog.text,
                children: []
            });
        } else {
            let end = tree[tree.length - 1];
            if (!end) {
                end = {
                    children: []
                };
                tree.push(end);
            }
            let current = end;
            for (let index = 0; index < catalog.level - 2; index++) {
                current.children = current.children || [];
                let obj = current.children[current.children.length - 1];
                if (!obj) {
                    obj = {
                        children: []
                    };
                    current.children.push(obj);
                }
                current = obj;
            }
            current.children.push({
                title: catalog.text,
                path: `#${catalog.id}`,
                level: catalog.level,
                content: catalog.content,
                text: catalog.text,
                children: []
            });
        }
    }
    return tree;
}

async function getSideBar(ctx) {
    const sideBars = {};
    // sort by order
    ctx.data.files.sort(function(file1, file2) {
        if (file1.md.setting && file2.md.setting) {
            return file1.md.setting.order - file2.md.setting.order;
        } else {
            return 0;
        }
    });
    await ctx.fsEach(function(file) {
        if (/demos/.test(file.path)) return;
        const md = file.md;
        const setting = md.setting;
        if (setting) {
            const sidebar = setting.sidebar;
            if (!sidebar) return;
            if (!sideBars[sidebar]) {
                sideBars[sidebar] = {};
            }
            sideBars[sidebar][setting.category] = sideBars[sidebar][setting.category] || [];
            sideBars[sidebar][setting.category].push(Object.assign({}, setting, {
                path: file.relative.replace(/\\/g, '/'),
                children: catalogsTree(md.catalogs)
            }));

            file.sideBars = sideBars[sidebar];
        }
    });
    return sideBars;
}
