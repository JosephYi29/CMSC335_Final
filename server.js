const express = require("express");
const path = require("path");
const moment = require("moment");
const session = require("express-session");
const fs = require("fs");
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
const connectionString = process.env.MONGO_CONNECTION_STRING;
const DBName = process.env.MONGO_DB_NAME;
const LeaderboardDB = process.env.MONGO_LEADERBOARD;
const NameDB = process.env.MONGO_NAMES;
// console.log(session.connectionString);

app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates"));
app.use(express.static(path.join(__dirname, "static")));

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
	console.log(
		`Web server started and running at http://localhost:${portNumber}`
	);

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
		}
	}
	async initializeNames() {
		const client = new MongoClient(connectionString, {
			serverApi: ServerApiVersion.v1,
		});
		try {
			await client.connect();
			const database = client.db(DBName);
			const collection = database.collection(NameDB);
			const result = await collection
				.aggregate([{ $sample: { size: 5 } }])
				.toArray();

			result.forEach((i) => {
				this.#names.push(i.name);
			});
		} catch (e) {
			console.error(e);
		} finally {
			await client.close();
		}
	}
	async makeGuess(userGuess) {
		const resp = await fetch(
			`https://api.agify.io?name=${this.#names[this.#attempts]}`
		);
		const data = await resp.json();

		const age = data.age;
		const diff = Math.abs(age - userGuess);
		// maxDiff = 50; maxScore = 5000;
		let score = 0;
		if (diff < 50) {
			score = Math.round(5000 * (1 - diff / 50));
		}

		this.#history.push({
			name: this.#names[this.#attempts],
			userGuess,
			correctAge: age,
			score,
		});
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

app.get("/play", async (req, res) => {
	delete req.session.game;
	req.session.game = new GameSession();
	req.session.names = await req.session.game.initializeNames();
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
	// console.log(game.getHistory());
	if (!req.session.game || game.getHistory().length < 5) {
		return res.redirect("/");
	}

	res.render("result", {
		score: game.getTotalScore(),
		history: game.getHistory(),
	});
});

/* ~~~~~~~~~~~~~~~~~~~~~~~ LEADERBOARD PAGE ~~~~~~~~~~~~~~~~~~~~~~~ */

app.get("/leaderboard", async (req, res) => {
	let scores;
	const client = new MongoClient(connectionString, {
		serverApi: ServerApiVersion.v1,
	});

	try {
		await client.connect();
		const database = client.db(DBName);
		const collection = database.collection(LeaderboardDB);

		scores = await collection.find({}).sort({ score: -1 }).limit(5).toArray();

		// console.log("Top 10 Scores:", scores);
	} catch (error) {
		console.error("Error fetching top scores:", error);
	} finally {
		await client.close();
		res.render("leaderboard", { results: scores });
	}
});

app.post("/leaderboard", async (req, res) => {
	const username = req.body.username;
	const game = new GameSession(req.session.game);
	const score = game.getTotalScore();

	const client = new MongoClient(connectionString, {
		serverApi: ServerApiVersion.v1,
	});

	let TopScores;
	try {
		await client.connect();
		const database = client.db(DBName);
		const collection = database.collection(LeaderboardDB);

		const entry = {
			name: username,
			score: score,
		};

		let result = await collection.insertOne(entry);
	} catch (e) {
		console.error(e);
	} finally {
		await client.close();
	}

	res.redirect("/leaderboard");
});
