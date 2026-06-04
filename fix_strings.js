const fs=require("fs"); let c=fs.readFileSync("gui/main.js", "utf8"); c=c.replace(/\\\`/g, "`"); fs.writeFileSync("gui/main.js", c);
