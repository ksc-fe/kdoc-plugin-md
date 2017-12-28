const md = require("markdown-it")();

module.exports = async function(ctx) {
    ctx.fs.each(function(file) {
        file.md = md.render(file.contents.toString());
        file.contents = null;
    });
};
