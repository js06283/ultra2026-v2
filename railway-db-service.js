// Railway-backed service that matches the existing AppDataService interface.
(function () {
	const API_BASE =
		window.RAILWAY_API_BASE ||
		(window.location.hostname === "localhost" ? "http://localhost:3000" : "");

	class RailwayDBService {
		constructor() {
			this.base = API_BASE;
			this.pollIntervalMs = 5000;
		}

		async request(path, options = {}) {
			const response = await fetch(`${this.base}${path}`, {
				headers: {
					"Content-Type": "application/json",
					...(options.headers || {}),
				},
				...options,
			});

			if (!response.ok) {
				const message = await response.text();
				throw new Error(`${response.status} ${response.statusText}: ${message}`);
			}

			const contentType = response.headers.get("content-type") || "";
			return contentType.includes("application/json")
				? response.json()
				: response.text();
		}

		async testConnection() {
			try {
				await this.request("/api/health");
				return true;
			} catch (error) {
				console.error("Railway DB connection test failed:", error);
				return false;
			}
		}

		async diagnoseIssues() {
			const issues = [];
			try {
				await this.request("/api/health");
			} catch (error) {
				issues.push("Cannot reach Railway API or database");
				issues.push(error.message);
			}
			return issues;
		}

		async saveAttendee(showId, attendeeName, state = "normal") {
			await this.request("/api/attendees", {
				method: "PUT",
				body: JSON.stringify({ showId, attendeeName, state }),
			});
			return true;
		}

		async saveAttendeeState(showId, attendeeName, state) {
			return this.saveAttendee(showId, attendeeName, state);
		}

		async removeAttendee(showId, attendeeName) {
			await this.request("/api/attendees", {
				method: "DELETE",
				body: JSON.stringify({ showId, attendeeName }),
			});
			return true;
		}

		async getAttendeesForShow(showId) {
			const data = await this.request(
				`/api/attendees/show/${encodeURIComponent(showId)}`
			);
			return data.attendees || [];
		}

		async getShowsForAttendee(attendeeName) {
			const data = await this.request(
				`/api/attendees/person/${encodeURIComponent(attendeeName)}`
			);
			return data.shows || [];
		}

		async getAllAttendeesData() {
			const data = await this.request("/api/attendees");
			const attendeesMap = new Map();
			(data.attendees || []).forEach((item) => {
				if (!attendeesMap.has(item.showId)) attendeesMap.set(item.showId, new Set());
				attendeesMap.get(item.showId).add(item.attendeeName);
			});
			return attendeesMap;
		}

		async getAllAttendeeStates() {
			const data = await this.request("/api/attendees");
			const statesMap = new Map();
			(data.attendees || []).forEach((item) => {
				if (!statesMap.has(item.showId)) statesMap.set(item.showId, new Map());
				statesMap.get(item.showId).set(item.attendeeName, item.state || "normal");
			});
			return statesMap;
		}

		async saveComment(showId, comment) {
			await this.request("/api/comments", {
				method: "POST",
				body: JSON.stringify({
					showId,
					name: comment.name,
					text: comment.text,
					timestamp: comment.timestamp || new Date().toISOString(),
				}),
			});
			return true;
		}

		async deleteComment(showId, commentIndex) {
			await this.request("/api/comments/delete", {
				method: "POST",
				body: JSON.stringify({ showId, commentIndex }),
			});
			return true;
		}

		async getAllCommentsData() {
			const data = await this.request("/api/comments");
			const commentsMap = new Map();
			(data.comments || []).forEach((item) => {
				if (!commentsMap.has(item.showId)) commentsMap.set(item.showId, []);
				commentsMap.get(item.showId).push({
					name: item.name,
					text: item.text,
					timestamp: item.timestamp,
				});
			});
			commentsMap.forEach((list) =>
				list.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
			);
			return commentsMap;
		}

		async getAllData() {
			const [attendees, states, comments] = await Promise.all([
				this.getAllAttendeesData(),
				this.getAllAttendeeStates(),
				this.getAllCommentsData(),
			]);
			return { attendees, states, comments };
		}

		onAttendeesChange(callback) {
			let active = true;
			const run = async () => {
				if (!active) return;
				try {
					const [attendeesMap, statesMap] = await Promise.all([
						this.getAllAttendeesData(),
						this.getAllAttendeeStates(),
					]);
					callback(attendeesMap, statesMap);
				} catch (error) {
					console.error("Attendees polling failed:", error);
				}
			};
			run();
			const id = setInterval(run, this.pollIntervalMs);
			return () => {
				active = false;
				clearInterval(id);
			};
		}

		onCommentsChange(callback) {
			let active = true;
			const run = async () => {
				if (!active) return;
				try {
					const data = await this.getAllCommentsData();
					callback(data);
				} catch (error) {
					console.error("Comments polling failed:", error);
				}
			};
			run();
			const id = setInterval(run, this.pollIntervalMs);
			return () => {
				active = false;
				clearInterval(id);
			};
		}

		async clearAllData() {
			await this.request("/api/clear", { method: "POST" });
			return true;
		}

		async exportData() {
			const data = await this.request("/api/export");
			return JSON.stringify(data, null, 2);
		}

		async importData(jsonData) {
			const parsed = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
			await this.request("/api/import", {
				method: "POST",
				body: JSON.stringify(parsed),
			});
			return true;
		}
	}

	window.__USE_RAILWAY_DB__ = true;
	window.AppDataService = RailwayDBService;
	console.log("Railway DB service initialized");
})();
