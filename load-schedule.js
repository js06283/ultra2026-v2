// Load and display the festival schedule
class ScheduleLoader {
	constructor() {
		this.parser = new FestivalScheduleParser();
	}

	// Load the CSV file and update the schedule
	async loadSchedule() {
		try {
			// Try to load the CSV file
			const response = await fetch("ultra_2026_inferred_schedule.csv");
			if (!response.ok) {
				throw new Error(`Failed to load CSV: ${response.status}`);
			}

			const csvText = await response.text();
			const schedule = this.parser.parseCSV(csvText);

			// Update the HTML with the real schedule
			this.updateHTML(schedule);

			console.log("Festival schedule loaded successfully:", schedule);
			return schedule;
		} catch (error) {
			console.error("Error loading schedule:", error);
			
			// Check if it's a CORS error (running locally)
			if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
				this.showCorsError();
			} else {
				this.showError();
			}
			return null;
		}
	}

	// Update the HTML with the real schedule
	updateHTML(schedule) {
		const festivalGrid = document.querySelector(".festival-grid");
		if (!festivalGrid) {
			console.error("Festival grid not found");
			return;
		}

		// Generate new HTML from the schedule
		const newHTML = this.parser.generateHTML();

		// Replace the existing content
		festivalGrid.innerHTML = newHTML;

		// Re-initialize the festival planner if it exists
		if (window.festivalPlanner) {
			window.festivalPlanner.scheduleLoaded = true;
			window.festivalPlanner.renderAttendees();
		}
	}

	// Show CORS error message for local development
	showCorsError() {
		const festivalGrid = document.querySelector(".festival-grid");
		if (festivalGrid) {
			festivalGrid.innerHTML = `
				<div class="error-placeholder">
					<div class="error-icon">🌐</div>
					<h3>Local Development Mode</h3>
					<p>To load the real festival schedule, you need to run this application through a local server due to browser security restrictions.</p>
					<div class="server-instructions">
						<h4>Quick Setup:</h4>
						<ol>
							<li><strong>Using Python:</strong> Open terminal in this folder and run:<br>
								<code>python -m http.server 8000</code></li>
							<li><strong>Using Node.js:</strong> Open terminal in this folder and run:<br>
								<code>npx serve .</code></li>
							<li>Then open <code>http://localhost:8000</code> in your browser</li>
						</ol>
					</div>
					<button onclick="location.reload()" class="btn-primary">Retry</button>
				</div>
			`;
		}
	}

	// Show error message if schedule loading fails
	showError() {
		const festivalGrid = document.querySelector(".festival-grid");
		if (festivalGrid) {
			festivalGrid.innerHTML = `
				<div class="error-placeholder">
					<div class="error-icon">⚠️</div>
					<h3>Failed to load schedule</h3>
					<p>Unable to load the ULTRA schedule. Please check that the CSV file is available and try refreshing the page.</p>
					<button onclick="location.reload()" class="btn-primary">Retry</button>
				</div>
			`;
		}
	}

	// Load schedule when the page loads
	init() {
		// Wait for the DOM to be ready
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => {
				this.loadSchedule();
			});
		} else {
			this.loadSchedule();
		}
	}
}

// Initialize the schedule loader
const scheduleLoader = new ScheduleLoader();
scheduleLoader.init();
