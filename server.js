const express = require("express");
const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, ".env"),
});
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates"));

if (
    process.argv.length !== 3 ||
    process.argv[2].length !== 4 ||
    isNaN(process.argv[2]) ||
    !Number.isInteger(Number(process.argv[2]))
) {
    process.stdout.write("Usage server.js [portNumber]\n");
    process.exit(0);
}
const portNumber = process.argv[2];

app.listen(portNumber, () => {
    console.log(`Web server started and running at http://localhost:${portNumber}`);

    process.stdin.setEncoding("utf8");
    process.stdout.write("Type 'stop' to shutdown the server: ");
    process.stdin.on("readable", () => {
        const dataInput = process.stdin.read();
        if (dataInput !== null) {
            const command = dataInput.trim().toLowerCase();
            if (command === "stop") {
                process.stdout.write("Shutting down the server\n");
                process.exit(0);
            } else {
                process.stdout.write(`Invalid command: ${command}\n`);
            }
            process.stdout.write("Type 'stop' to shutdown the server: ");
            process.stdin.resume();
        }
    });
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ LANDING PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/", (req, res) => {
    res.render("index");
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ PLAY PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/play", (req, res) => {
    res.render("play");
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ LEADERBOARD PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/leaderboard", (req, res) => {
    res.render("leaderboard");
});
