const express = require("express");
const path = require("path");
const moment = require("moment");
const session = require("express-session");
const fs = require("fs");
const { faker } = require("@faker-js/faker");
require("dotenv").config({
    path: path.resolve(__dirname, ".env"),
});
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);
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

/* ~~~~~~~~~~~~~~~~~~~~~~~ GAME SESSION OBJECT ~~~~~~~~~~~~~~~~~~~~~~~ */

class GameSession {
    #attempts = 0;
    #totalScore = 0;
    #history = [];
    #time;
    #names = [];

    constructor(session = null) {
        if (session) {
            // object recreation between sessions
            this.#attempts = session.attempts;
            this.#totalScore = session.totalScore;
            this.#history = session.history;
            this.#time = session.time;
            this.#names = session.names;
        } else {
            // TODO: grabbing from static text file, CHANGE to grab from mongoDB!!!
            const validNameFile = path.resolve(__dirname, "static", "valid_names.txt");
            const validNames = fs.readFileSync(validNameFile, "utf-8").split(/\r?\n/);

            // grab 5 random non-repeating indices (current list of names is 477)
            const indices = new Set();
            while (indices.size < 5) {
                indices.add(Math.floor(Math.random() * 477));
            }

            indices.forEach((i) => {
                this.#names.push(validNames[i]);
            });

            // console.log(this.#names);
        }
    }

    async makeGuess(userGuess) {
        const resp = await fetch(`https://api.agify.io?name=${this.#names[this.#attempts]}`);
        const data = await resp.json();

        const age = data.age;
        const diff = Math.abs(age - userGuess);
        // maxDiff = 50; maxScore = 5000;
        let score = 0;
        if (diff < 50) {
            score = Math.round(5000 * (1 - diff / 50));
        }

        this.#history.push({ name: this.#names[this.#attempts], userGuess, correctAge: age, score });
        this.#totalScore += score;
        this.#attempts++;
    }

    isOver() {
        return this.#attempts >= 5;
    }

    setTime() {
        this.#time = moment().format("MM/DD/YYYY HH:mm:ss");
    }

    getNextName() {
        return this.#names[this.#attempts];
    }

    getNumberAttempts() {
        return this.#attempts;
    }

    getTotalScore() {
        return this.#totalScore;
    }

    getHistory() {
        return this.#history;
    }

    toJSON() {
        return {
            attempts: this.#attempts,
            totalScore: this.#totalScore,
            history: this.#history,
            time: this.#time,
            names: this.#names,
        };
    }
}

/* ~~~~~~~~~~~~~~~~~~~~~~~ LANDING PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/", (req, res) => {
    res.render("index");
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ PLAY ROUTES ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/play", (req, res) => {
    delete req.session.game;
    req.session.game = new GameSession();
    res.redirect("/guess");
});

app.get("/guess", async (req, res) => {
    const game = new GameSession(req.session.game);
    if (game.isOver()) {
        game.setTime();
        return res.redirect("/result");
    }

    res.render("guessing", {
        name: game.getNextName(),
        attempts: game.getNumberAttempts() + 1,
        remaining: 5 - game.getNumberAttempts(),
    });
});

app.post("/guess", async (req, res) => {
    const userGuess = req.body.age;
    const game = new GameSession(req.session.game);

    await game.makeGuess(userGuess);
    req.session.game = game.toJSON();

    if (game.isOver()) {
        game.setTime();
        return res.redirect("/result");
    } else {
        return res.redirect("/guess");
    }
});

app.get("/result", (req, res) => {
    const game = new GameSession(req.session.game);
    console.log(game.getHistory());
    if (!req.session.game || game.getHistory().length < 5) {
        return res.redirect("/");
    }

    res.render("result", { score: game.getTotalScore(), history: game.getHistory() });
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ LEADERBOARD PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/leaderboard", (req, res) => {
    res.render("leaderboard");
});

app.post("/leaderboard", (req, res) => {
    // TODO: handle new entry into MONGODB
    res.render("leaderboard");
});
