const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl:
		process.env.NODE_ENV === "production"
			? { rejectUnauthorized: false }
			: false,
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function initDb() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS attendees (
			show_id TEXT NOT NULL,
			attendee_name TEXT NOT NULL,
			state TEXT NOT NULL DEFAULT 'normal',
			timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (show_id, attendee_name)
		);
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS comments (
			id BIGSERIAL PRIMARY KEY,
			show_id TEXT NOT NULL,
			name TEXT NOT NULL,
			text TEXT NOT NULL,
			timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);
}

app.get("/api/health", async (_req, res) => {
	try {
		await pool.query("SELECT 1");
		res.json({ ok: true });
	} catch (error) {
		res.status(500).json({ ok: false, error: error.message });
	}
});

app.get("/api/attendees", async (_req, res) => {
	const result = await pool.query(
		"SELECT show_id, attendee_name, state, timestamp FROM attendees"
	);
	res.json({
		attendees: result.rows.map((r) => ({
			showId: r.show_id,
			attendeeName: r.attendee_name,
			state: r.state,
			timestamp: r.timestamp,
		})),
	});
});

app.get("/api/attendees/show/:showId", async (req, res) => {
	const result = await pool.query(
		"SELECT attendee_name FROM attendees WHERE show_id = $1",
		[req.params.showId]
	);
	res.json({ attendees: result.rows.map((r) => r.attendee_name) });
});

app.get("/api/attendees/person/:name", async (req, res) => {
	const result = await pool.query(
		"SELECT show_id FROM attendees WHERE attendee_name = $1 AND state != 'deleted'",
		[req.params.name]
	);
	res.json({ shows: result.rows.map((r) => r.show_id) });
});

app.put("/api/attendees", async (req, res) => {
	const { showId, attendeeName, state = "normal" } = req.body;
	await pool.query(
		`INSERT INTO attendees (show_id, attendee_name, state, timestamp)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (show_id, attendee_name)
		 DO UPDATE SET state = EXCLUDED.state, timestamp = NOW()`,
		[showId, attendeeName, state]
	);
	res.json({ ok: true });
});

app.delete("/api/attendees", async (req, res) => {
	const { showId, attendeeName } = req.body;
	await pool.query(
		"DELETE FROM attendees WHERE show_id = $1 AND attendee_name = $2",
		[showId, attendeeName]
	);
	res.json({ ok: true });
});

app.get("/api/comments", async (_req, res) => {
	const result = await pool.query(
		"SELECT id, show_id, name, text, timestamp FROM comments ORDER BY timestamp ASC"
	);
	res.json({
		comments: result.rows.map((r) => ({
			id: r.id,
			showId: r.show_id,
			name: r.name,
			text: r.text,
			timestamp: r.timestamp,
		})),
	});
});

app.post("/api/comments", async (req, res) => {
	const { showId, name, text, timestamp } = req.body;
	await pool.query(
		"INSERT INTO comments (show_id, name, text, timestamp) VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))",
		[showId, name, text, timestamp || null]
	);
	res.json({ ok: true });
});

app.post("/api/comments/delete", async (req, res) => {
	const { showId, commentIndex } = req.body;
	const result = await pool.query(
		"SELECT id FROM comments WHERE show_id = $1 ORDER BY timestamp ASC, id ASC",
		[showId]
	);
	const row = result.rows[commentIndex];
	if (!row) return res.status(404).json({ ok: false, error: "Comment not found" });

	await pool.query("DELETE FROM comments WHERE id = $1", [row.id]);
	res.json({ ok: true });
});

app.post("/api/clear", async (_req, res) => {
	await pool.query("DELETE FROM attendees");
	await pool.query("DELETE FROM comments");
	res.json({ ok: true });
});

app.get("/api/export", async (_req, res) => {
	const [attendeesResult, commentsResult] = await Promise.all([
		pool.query("SELECT show_id, attendee_name, state FROM attendees"),
		pool.query("SELECT show_id, name, text, timestamp FROM comments"),
	]);

	const attendees = {};
	const attendeeStates = {};
	attendeesResult.rows.forEach((r) => {
		if (!attendees[r.show_id]) attendees[r.show_id] = [];
		attendees[r.show_id].push(r.attendee_name);
		if (!attendeeStates[r.show_id]) attendeeStates[r.show_id] = {};
		attendeeStates[r.show_id][r.attendee_name] = r.state;
	});

	const comments = {};
	commentsResult.rows.forEach((r) => {
		if (!comments[r.show_id]) comments[r.show_id] = [];
		comments[r.show_id].push({
			name: r.name,
			text: r.text,
			timestamp: r.timestamp,
		});
	});

	res.json({ attendees, attendeeStates, comments });
});

app.post("/api/import", async (req, res) => {
	const { attendees = {}, attendeeStates = {}, comments = {} } = req.body || {};

	await pool.query("BEGIN");
	try {
		await pool.query("DELETE FROM attendees");
		await pool.query("DELETE FROM comments");

		for (const [showId, names] of Object.entries(attendees)) {
			for (const attendeeName of names) {
				const state = attendeeStates?.[showId]?.[attendeeName] || "normal";
				await pool.query(
					`INSERT INTO attendees (show_id, attendee_name, state, timestamp)
					 VALUES ($1, $2, $3, NOW())
					 ON CONFLICT (show_id, attendee_name)
					 DO UPDATE SET state = EXCLUDED.state, timestamp = NOW()`,
					[showId, attendeeName, state]
				);
			}
		}

		for (const [showId, list] of Object.entries(comments)) {
			for (const comment of list) {
				await pool.query(
					"INSERT INTO comments (show_id, name, text, timestamp) VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))",
					[showId, comment.name, comment.text, comment.timestamp || null]
				);
			}
		}

		await pool.query("COMMIT");
		res.json({ ok: true });
	} catch (error) {
		await pool.query("ROLLBACK");
		res.status(500).json({ ok: false, error: error.message });
	}
});

app.get("*", (_req, res) => {
	res.sendFile(path.join(__dirname, "index.html"));
});

initDb()
	.then(() => {
		app.listen(port, () => {
			console.log(`Server listening on port ${port}`);
		});
	})
	.catch((error) => {
		console.error("Database initialization failed:", error);
		process.exit(1);
	});
