const express = require("express");
const path = require("path");
const moment = require("moment");
const session = require("express-session");
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
app.use(express.static(path.join(__dirname, 'static')));

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

    async makeGuess(name, age, userGuess) {
        const diff = Math.abs(age - userGuess);
        // maxDiff = 25; maxScore = 5000;
        let score = 0;
        if (diff < 25) {
            score = Math.round(5000 * (1 - diff / 25));
        }

        this.#history.push({ name, userGuess, age, score });
        this.#totalScore += score;
        this.#attempts++;
        console.log(this.#attempts);
        console.log(name);
        console.log(age);
        console.log(score);
    }

    isOver() {
        return this.#attempts >= 5;
    }

    setTime() {
        this.#time = moment().format("MM/DD/YYYY HH:mm:ss");
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
        };
    }

    static fromJSON(data) {
        const session = new GameSession();
        session.#attempts = data.attempts;
        session.#totalScore = data.totalScore;
        session.#history = data.history;
        session.#time = data.time;
        return session;
    }

    static async getValidNameAndAge() {
        let name = "";
        let age = null;
        do {
            name = faker.person.firstName();
            const resp = await fetch(`https://api.agify.io?name=${name}&country_id=US`);
            const data = await resp.json();
            age = data.age;
        } while (age === null);

        console.log({ name, age });
        return { name, age };
    }
}

/* ~~~~~~~~~~~~~~~~~~~~~~~ LANDING PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/", (req, res) => {
    res.render("index");
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ PLAY ROUTES ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/play", (req, res) => {
    req.session.game = new GameSession();
    res.redirect("/guess");
});

app.get("/guess", async (req, res) => {
    const game = GameSession.fromJSON(req.session.game);
    if (!game || game.isOver()) {
        game.setTime();
        return res.redirect("/result");
    }

    const { name, age } = await GameSession.getValidNameAndAge();
    req.session.currentName = name;
    req.session.age = age;

    res.render("play", { name, attempts: game.getNumberAttempts() + 1, remaining: 5 - game.getNumberAttempts() });
});

app.post("/guess", async (req, res) => {
    const userGuess = req.body.age;
    const game = GameSession.fromJSON(req.session.game);
    if (!game || game.isOver()) {
        game.setTime();
        return res.redirect("/result");
    }

    await game.makeGuess(req.session.currentName, req.session.age, userGuess);
    req.session.game = game.toJSON();

    if (game.isOver()) {
        return res.redirect("/result");
    } else {
        return res.redirect("/guess");
    }
});

app.get("/result", (req, res) => {
    const game = GameSession.fromJSON(req.session.game);
    if (!game) {
        return res.redirect("/");
    }

    res.render("result", { score: game.getTotalScore(), history: game.getHistory() });
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ LEADERBOARD PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/leaderboard", (req, res) => {
    res.render("leaderboard");
});
