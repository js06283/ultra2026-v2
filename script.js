class FestivalPlanner {
	constructor() {
		this.attendees = new Map(); // Map of showId to Set of attendee names
		this.attendeeStates = new Map(); // Map of showId to Map of name to state
		this.comments = new Map(); // Map of showId to Array of comment objects
		this.allTogetherShows = new Set();
		this.currentName = null;
		this.currentDay = "all";
		this.scheduleMode = "all"; // all | my | group
		this.viewMode = "stage"; // stage | chronological | timeline
		this.scheduleLoaded = false;
		this.dataService = null;
		this.unsubscribe = null;
		this.lockscreenPreviewUrl = null;

		// Unique colors for each person
		this.personColors = {
			Jess: "#FF6B6B", // Coral Red
			Theo: "#4ECDC4", // Turquoise
			Andy: "#45B7D1", // Sky Blue
			Noel: "#96CEB4", // Mint Green
			Kevin: "#9C6A00", // Dark amber for better contrast
			Ellen: "#DDA0DD", // Plum
			PJ: "#98D8C8", // Seafoam Green
			Other: "#F7DC6F", // Golden Yellow for custom names
		};

		this.init();
	}

	async init() {
		// Wait for data service to be available
		let attempts = 0;
		const maxAttempts = 50; // Wait up to 5 seconds (50 * 100ms)

		while (!window.AppDataService && attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			attempts++;
		}

		// Initialize Railway data service
		if (window.AppDataService) {
			try {
				this.dataService = new window.AppDataService();

				// Test data service connection
				const connectionTest = await this.dataService.testConnection();
				if (!connectionTest) {
					console.warn(
						"Data service connection test failed, falling back to localStorage"
					);
					console.warn("Railway API may be unavailable.");

					// Run diagnostics to help identify the issue
					const issues = await this.dataService.diagnoseIssues();
					if (issues.length > 0) {
						console.warn("Data service deployment issues detected:");
						issues.forEach((issue) => console.warn("- " + issue));
					}

					this.dataService = null;
					this.loadData();
				} else {
					await this.loadData();
					this.setupRealTimeListener();
					console.log("Data service initialized successfully");
				}
			} catch (error) {
				console.error("Error initializing data service:", error);
				console.warn(
					"Falling back to localStorage due to data service initialization error"
				);
				this.dataService = null;
				this.loadData();
			}
		} else {
			console.warn("Data service not available, falling back to localStorage");
			this.loadData();
		}
		this.setupEventListeners();

		// Wait for schedule to load before rendering
		this.waitForSchedule();
	}

	loadAllTogetherFlags() {
		try {
			const raw = localStorage.getItem("festivalPlannerAllTogetherShows");
			if (!raw) {
				this.allTogetherShows = new Set();
				return;
			}
			const ids = JSON.parse(raw);
			this.allTogetherShows = new Set(Array.isArray(ids) ? ids : []);
		} catch (error) {
			console.error("Error loading all-together flags:", error);
			this.allTogetherShows = new Set();
		}
	}

	saveAllTogetherFlags() {
		try {
			localStorage.setItem(
				"festivalPlannerAllTogetherShows",
				JSON.stringify(Array.from(this.allTogetherShows))
			);
		} catch (error) {
			console.error("Error saving all-together flags:", error);
		}
	}

	// Wait for the schedule to be loaded
	waitForSchedule() {
		const checkSchedule = () => {
			const festivalGrid = document.querySelector(".festival-grid");
			const loadingPlaceholder = document.querySelector(".loading-placeholder");

			if (loadingPlaceholder && festivalGrid.children.length > 1) {
				// Schedule has been loaded
				this.scheduleLoaded = true;
				this.renderAttendees();
			} else if (loadingPlaceholder) {
				// Still loading, check again in 100ms
				setTimeout(checkSchedule, 100);
			} else {
				// No loading placeholder, schedule might already be loaded
				this.scheduleLoaded = true;
				this.renderAttendees();
			}
		};

		checkSchedule();
	}

	setupRealTimeListener() {
		if (this.dataService) {
			this.unsubscribe = this.dataService.onAttendeesChange(
				(attendeesMap, statesMap) => {
					this.attendees = attendeesMap;
					this.attendeeStates = statesMap || this.attendeeStates || new Map();
					this.renderAttendees();
				}
			);

			// Set up comments listener
			this.commentsUnsubscribe = this.dataService.onCommentsChange(
				(commentsMap) => {
					this.comments = commentsMap;
					// Update comments count for all shows
					this.comments.forEach((commentArray, showId) => {
						this.updateCommentsCount(showId);
					});
					// Re-render comments for open comment sections
					document
						.querySelectorAll(".comments-container.show")
						.forEach((container) => {
							const showElement = container.closest("[data-show]");
							if (showElement) {
								const showId = showElement.dataset.show;
								this.renderComments(showId);
							}
						});
				}
			);
		}
	}

	setupEventListeners() {
		// Name input functionality
		const nameSelect = document.getElementById("nameSelect");
		const nameInput = document.getElementById("nameInput");
		const addNameBtn = document.getElementById("addNameBtn");

		// Handle select dropdown change
		nameSelect.addEventListener("change", (e) => {
			const selectedValue = e.target.value;
			if (selectedValue === "custom") {
				// Show custom name input
				nameInput.style.display = "block";
				nameInput.focus();
				nameSelect.style.width = "150px";
			} else if (selectedValue) {
				// Hide custom name input and use selected name
				nameInput.style.display = "none";
				nameInput.value = "";
				nameSelect.style.width = "200px";
				this.currentName = selectedValue;
				this.showNotification(`Selected: ${selectedValue}`, "success");
				// Apply filters to update the display immediately
				this.applyFilters();
			} else {
				// No selection, hide custom input
				nameInput.style.display = "none";
				nameInput.value = "";
				nameSelect.style.width = "200px";
				this.currentName = "";
				// Apply filters to update the display immediately
				this.applyFilters();
			}
		});

		// Handle custom name input
		nameInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				this.handleNameSubmit();
			}
		});

		// Handle add name button
		addNameBtn.addEventListener("click", () => {
			this.handleNameSubmit();
		});

		// Handle day toggles
		const dayToggles = document.querySelectorAll(".day-toggle");
		dayToggles.forEach((toggle) => {
			toggle.addEventListener("click", (e) => {
				const selectedDay = e.target.dataset.day;
				this.setCurrentDay(selectedDay);
			});
		});

		// Handle schedule mode dropdown
		const scheduleModeSelect = document.getElementById("scheduleModeSelect");
		if (scheduleModeSelect) {
			scheduleModeSelect.addEventListener("change", (e) => {
				this.setScheduleMode(e.target.value);
			});
		}

		// Handle Chronological toggle
		const chronologicalToggle = document.getElementById("chronologicalToggle");
		if (chronologicalToggle) {
			chronologicalToggle.addEventListener("click", () => {
				this.toggleChronological();
			});
		}

		// Handle Timeline toggle
			const timelineToggle = document.getElementById("timelineToggle");
		if (timelineToggle) {
			timelineToggle.addEventListener("click", () => {
				this.toggleTimeline();
			});
		}

		const exportLockscreenBtn = document.getElementById("exportLockscreenBtn");
		if (exportLockscreenBtn) {
			exportLockscreenBtn.addEventListener("click", () => {
				this.openLockscreenExportModal();
			});
		}

		const lockscreenModal = document.getElementById("lockscreenExportModal");
		if (lockscreenModal) {
			lockscreenModal.addEventListener("click", (e) => {
				if (e.target.matches("[data-close-lockscreen-modal]")) {
					this.closeLockscreenExportModal();
				}
			});
		}

		const lockscreenControls = [
			document.getElementById("lockscreenDaySelect"),
			document.getElementById("lockscreenSourceSelect"),
			document.getElementById("lockscreenLayoutSelect"),
		];
		lockscreenControls.forEach((control) => {
			if (!control) return;
			control.addEventListener("change", () => {
				this.refreshLockscreenPreview();
			});
		});

		const refreshPreviewBtn = document.getElementById(
			"refreshLockscreenPreviewBtn"
		);
		if (refreshPreviewBtn) {
			refreshPreviewBtn.addEventListener("click", () => {
				this.refreshLockscreenPreview();
			});
		}

		const downloadLockscreenBtn = document.getElementById(
			"downloadLockscreenBtn"
		);
		if (downloadLockscreenBtn) {
			downloadLockscreenBtn.addEventListener("click", async () => {
				await this.downloadLockscreenExport();
			});
		}

		// Show click functionality - use event delegation for dynamic content
		document.addEventListener("click", (e) => {
			if (
				e.target.closest(".comments-section") ||
				e.target.closest(".all-together-toggle")
			) {
				return;
			}
			const show = e.target.closest(".show");
			if (show && this.currentName) {
				this.toggleAttendee(show);
			}
		});

		// Focus on name select when page loads
		nameSelect.focus();
		this.updateScheduleModeButton();
	}

	handleNameSubmit() {
		const nameSelect = document.getElementById("nameSelect");
		const nameInput = document.getElementById("nameInput");

		let name = "";

		if (nameSelect.value === "custom") {
			// Use custom name input
			name = nameInput.value.trim();
		} else if (nameSelect.value) {
			// Use selected name
			name = nameSelect.value.trim();
		}

		if (!name) {
			this.showNotification("Please select or enter a name", "error");
			return;
		}

		if (name.length > 50) {
			this.showNotification("Name must be 50 characters or less", "error");
			return;
		}

		this.currentName = name;
		this.showNotification(`Selected: ${name}`, "success");

		// Remove the choose person message if it exists
		this.removeChoosePersonMessage();

		// Clear inputs
		nameSelect.value = "";
		nameInput.value = "";
		nameInput.style.display = "none";
		nameSelect.style.width = "200px";

		// Apply filters to update the display immediately
		this.applyFilters();
	}

	// Remove the choose person message
	removeChoosePersonMessage() {
		const existingMessage = document.querySelector(".choose-person-message");
		if (existingMessage) {
			existingMessage.remove();
		}
	}

	// Set current day filter
	setCurrentDay(day) {
		this.currentDay = day;

		// Update toggle buttons
		document.querySelectorAll(".day-toggle").forEach((toggle) => {
			toggle.classList.remove("active");
		});
		document.querySelector(`[data-day="${day}"]`).classList.add("active");

		// Remove the choose person message when switching days (it will be re-added if needed)
		this.removeChoosePersonMessage();

		// Apply filters
		this.applyFilters();
	}

	setScheduleMode(mode) {
		const validModes = new Set(["all", "my", "group"]);
		this.scheduleMode = validModes.has(mode) ? mode : "all";
		this.updateScheduleModeButton();
		this.removeChoosePersonMessage();
		this.applyFilters();
	}

	updateScheduleModeButton() {
		const scheduleModeSelect = document.getElementById("scheduleModeSelect");
		if (!scheduleModeSelect) return;
		scheduleModeSelect.value = this.scheduleMode;
	}

	requiresSelectedPerson() {
		return this.scheduleMode === "my";
	}

	isGroupInterested(showId) {
		if (!this.attendees.has(showId)) return false;
		for (const attendee of this.attendees.get(showId)) {
			const state = this.getAttendeeState(showId, attendee);
			if (state !== "deleted") return true;
		}
		return false;
	}

	// Toggle Chronological view
	toggleChronological() {
		this.viewMode =
			this.viewMode === "chronological" ? "stage" : "chronological";
		this.updateViewModeButtons();
		this.applyFilters();
	}

	// Toggle Timeline view
	toggleTimeline() {
		this.viewMode = this.viewMode === "timeline" ? "stage" : "timeline";
		this.updateViewModeButtons();
		this.applyFilters();
	}

	updateViewModeButtons() {
		const chronologicalToggle = document.getElementById("chronologicalToggle");
		const timelineToggle = document.getElementById("timelineToggle");

		if (chronologicalToggle) {
			chronologicalToggle.classList.toggle(
				"active",
				this.viewMode === "chronological"
			);
		}
		if (timelineToggle) {
			timelineToggle.classList.toggle("active", this.viewMode === "timeline");
		}
	}

	// Apply current filters (day, My Schedule, and Chronological)
	applyFilters() {
		// Remove the choose person message if a person is selected
		if (this.currentName) {
			this.removeChoosePersonMessage();
		}

		if (this.viewMode === "chronological") {
			this.showChronologicalView();
		} else if (this.viewMode === "timeline") {
			this.showTimelineView();
		} else {
			this.showStageView();
		}
	}

	// Show chronological view
	showChronologicalView() {
		const festivalGrid = document.querySelector(".festival-grid");

		// Hide all day sections instead of removing them
		document.querySelectorAll(".day-section").forEach((section) => {
			section.style.display = "none";
		});

		// Remove any existing chronological view
		const existingChronologicalView = festivalGrid.querySelector(
			".chronological-view"
		);
		if (existingChronologicalView) {
			existingChronologicalView.remove();
		}
		const existingTimelineView = festivalGrid.querySelector(".timeline-view");
		if (existingTimelineView) {
			existingTimelineView.remove();
		}

		// Remove any existing choose person message
		this.removeChoosePersonMessage();

		// My Schedule requires selected person
		if (this.requiresSelectedPerson() && !this.currentName) {
			this.showChoosePersonMessage();
			return;
		}

		// Create chronological view
		const chronologicalView = document.createElement("div");
		chronologicalView.className = "chronological-view";

		// Get all shows and sort them chronologically
		const allShows = this.getAllShowsForChronological();

		// Filter shows based on current day selection and My Schedule if enabled
		let filteredShows = allShows;

		// First, filter by day if not "all"
		if (this.currentDay !== "all") {
			filteredShows = allShows.filter((show) => {
				const dayTitle = (show.originalDay || show.day).toLowerCase();
				return dayTitle.includes(this.currentDay);
			});
		}

		// Then, filter by schedule mode
		if (this.scheduleMode === "my" && this.currentName) {
			filteredShows = filteredShows.filter((show) => this.isUserAttending(show.id));
		} else if (this.scheduleMode === "group") {
			filteredShows = filteredShows.filter((show) =>
				this.isGroupInterested(show.id)
			);
		}

		// Create chronological show elements
		filteredShows.forEach((show) => {
			const showElement = this.createChronologicalShowElement(show);
			chronologicalView.appendChild(showElement);
		});

		if (this.scheduleMode !== "all" && filteredShows.length === 0) {
			const emptyState = this.createScheduleEmptyState(this.scheduleMode);
			chronologicalView.appendChild(emptyState);
		}

		// Prevent empty blank screen when filters return no shows
		if (
			filteredShows.length === 0 &&
			this.scheduleMode === "all"
		) {
			const emptyState = document.createElement("div");
			emptyState.className = "choose-person-message";
			emptyState.innerHTML = `
				<div class="choose-person-content">
					<div class="choose-person-icon">📭</div>
					<h3>No Shows Found</h3>
					<p>Try changing day filters.</p>
				</div>
			`;
			chronologicalView.appendChild(emptyState);
		}

		// Add chronological view to the grid (don't clear existing content)
		festivalGrid.appendChild(chronologicalView);

		// Render attendees for the chronological view
		this.renderAttendees();
	}

	// Show stage view (original view)
	showStageView() {
		const festivalGrid = document.querySelector(".festival-grid");

		// Remove chronological view if it exists
		const chronologicalView = festivalGrid.querySelector(".chronological-view");
		if (chronologicalView) {
			chronologicalView.remove();
		}
		const timelineView = festivalGrid.querySelector(".timeline-view");
		if (timelineView) {
			timelineView.remove();
		}

		// Remove any existing choose person message
		this.removeChoosePersonMessage();

		// My Schedule requires selected person
		if (this.requiresSelectedPerson() && !this.currentName) {
			this.showChoosePersonMessage();
			return;
		}

		// Show day sections based on current filters
		const daySections = document.querySelectorAll(".day-section");

		daySections.forEach((section) => {
			const dayTitle = section
				.querySelector(".day-title")
				.textContent.toLowerCase();
			const shouldShowDay =
				this.currentDay === "all" || dayTitle.includes(this.currentDay);

			if (!shouldShowDay) {
				section.style.display = "none";
				return;
			}

			section.style.display = "block";
			if (this.scheduleMode === "my" && this.currentName) {
				this.filterShowsForMySchedule(section);
			} else if (this.scheduleMode === "group") {
				this.filterShowsForGroupSchedule(section);
			} else {
				this.showAllShows(section);
			}

			const visibleShows = Array.from(section.querySelectorAll(".show")).some(
				(show) => show.style.display !== "none"
			);
			if (!visibleShows) {
				section.style.display = "none";
			}
		});

		// Prevent empty blank screen when no stage sections are visible.
		const hasVisibleDay = Array.from(daySections).some(
			(section) => section.style.display !== "none"
		);
		if (!hasVisibleDay) {
			if (this.scheduleMode === "my") {
				this.showScheduleEmptyMessage("my");
			} else if (this.scheduleMode === "group") {
				this.showScheduleEmptyMessage("group");
			} else {
				this.showNoResultsMessage("No shows found for the current filters.");
			}
		}
	}

	showTimelineView() {
		const festivalGrid = document.querySelector(".festival-grid");
		document.querySelectorAll(".day-section").forEach((section) => {
			section.style.display = "none";
		});

		const existingChronologicalView = festivalGrid.querySelector(
			".chronological-view"
		);
		if (existingChronologicalView) existingChronologicalView.remove();
		const existingTimelineView = festivalGrid.querySelector(".timeline-view");
		if (existingTimelineView) existingTimelineView.remove();

		this.removeChoosePersonMessage();

		if (this.requiresSelectedPerson() && !this.currentName) {
			this.showChoosePersonMessage();
			return;
		}

		const timelineView = document.createElement("div");
		timelineView.className = "timeline-view";

		const daySections = Array.from(document.querySelectorAll(".day-section")).filter(
			(section) => {
				const dayTitle = section
					.querySelector(".day-title")
					.textContent.toLowerCase();
				return this.currentDay === "all" || dayTitle.includes(this.currentDay);
			}
		);

		let totalShowsRendered = 0;
		daySections.forEach((section) => {
			const dayData = this.buildTimelineDayData(section);
			if (!dayData || dayData.shows.length === 0) return;

			let shows = dayData.shows;
			if (this.scheduleMode === "my" && this.currentName) {
				shows = shows.filter((show) => this.isUserAttending(show.id));
			} else if (this.scheduleMode === "group") {
				shows = shows.filter((show) => this.isGroupInterested(show.id));
			}
			if (shows.length === 0) return;

			totalShowsRendered += shows.length;
			const board = this.createTimelineBoard(dayData.dayTitle, dayData.stages, shows);
			timelineView.appendChild(board);
		});

		if (totalShowsRendered === 0) {
			if (this.scheduleMode !== "all") {
				timelineView.appendChild(this.createScheduleEmptyState(this.scheduleMode));
			} else {
				this.showNoResultsMessage("No shows found for the current filters.");
				return;
			}
		}

		festivalGrid.appendChild(timelineView);
		this.renderAttendees();
	}

	buildTimelineDayData(daySection) {
		const dayTitle = daySection.querySelector(".day-title")?.textContent?.trim();
		if (!dayTitle) return null;

		const stageElements = Array.from(daySection.querySelectorAll(".stage"));
		const stages = stageElements.map((stageEl) => ({
			key: stageEl.dataset.stage,
			name: stageEl.querySelector(".stage-title")?.textContent?.trim() || "Stage",
			color: stageEl.style.getPropertyValue("--stage-color").trim(),
		}));

		const shows = [];
		stageElements.forEach((stageEl) => {
			const stageKey = stageEl.dataset.stage;
			const stageName = stageEl.querySelector(".stage-title")?.textContent?.trim();
			const stageColor = stageEl.style.getPropertyValue("--stage-color").trim();

			stageEl.querySelectorAll(".show").forEach((showEl) => {
				const range = this.parseTimeRange(showEl.querySelector(".show-time")?.textContent || "");
				if (!range) return;
				shows.push({
					id: showEl.dataset.show,
					title: showEl.querySelector(".show-title")?.textContent || "",
					timeText: showEl.querySelector(".show-time")?.textContent || "",
					stageKey: stageKey,
					stageName: stageName,
					stageColor: stageColor,
					start: range.start,
					end: range.end,
				});
			});
		});

		return { dayTitle, stages, shows };
	}

	parseTimeRange(timeText) {
		const parts = (timeText || "").split("-").map((p) => p.trim());
		const start = this.parseClockToMinutes(parts[0]);
		if (start == null) return null;

		let end = null;
		if (parts.length > 1) end = this.parseClockToMinutes(parts[1]);
		if (end == null) end = start + 60;
		if (end <= start) end += 24 * 60;

		return { start, end };
	}

	parseClockToMinutes(text) {
		const match = (text || "")
			.toUpperCase()
			.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
		if (!match) return null;
		let hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);
		const period = match[3];
		if (period === "PM" && hours !== 12) hours += 12;
		if (period === "AM" && hours === 12) hours = 0;
		return hours * 60 + minutes;
	}

	formatTimelineHour(totalMinutes) {
		const minutesInDay = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
		let hours = Math.floor(minutesInDay / 60);
		const period = hours >= 12 ? "PM" : "AM";
		hours = hours % 12;
		if (hours === 0) hours = 12;
		return `${hours}${period}`;
	}

	createTimelineBoard(dayTitle, stages, shows) {
		const minStart = Math.floor(Math.min(...shows.map((s) => s.start)) / 60) * 60;
		const maxEnd = Math.ceil(Math.max(...shows.map((s) => s.end)) / 60) * 60;
		const pxPerMinute = 1.05;
		const totalMinutes = maxEnd - minStart;
		const gridHeight = Math.max(480, Math.round(totalMinutes * pxPerMinute));
		const hourCount = Math.max(1, Math.round(totalMinutes / 60));

		const dayBoard = document.createElement("section");
		dayBoard.className = "timeline-day-board";
		dayBoard.innerHTML = `<h3 class="timeline-day-title">${this.escapeHtml(dayTitle)}</h3>`;

		const board = document.createElement("div");
		board.className = "timeline-board";
		board.style.setProperty("--timeline-height", `${gridHeight}px`);
		board.style.setProperty("--timeline-hours", `${hourCount}`);
		board.style.setProperty("--timeline-hour-px", `${Math.round(60 * pxPerMinute)}px`);
		board.style.gridTemplateColumns = `78px repeat(${stages.length}, minmax(150px, 1fr))`;

		const emptyHeader = document.createElement("div");
		emptyHeader.className = "timeline-header timeline-header-empty";
		board.appendChild(emptyHeader);

		stages.forEach((stage) => {
			const h = document.createElement("div");
			h.className = "timeline-header";
			h.textContent = stage.name;
			h.style.borderTop = `3px solid ${stage.color || "#62b8ff"}`;
			board.appendChild(h);
		});

		const yAxis = document.createElement("div");
		yAxis.className = "timeline-y-axis";
		yAxis.style.height = `${gridHeight}px`;
		for (let t = minStart; t <= maxEnd; t += 60) {
			const tick = document.createElement("div");
			tick.className = "timeline-y-tick";
			tick.style.top = `${Math.round((t - minStart) * pxPerMinute)}px`;
			tick.textContent = this.formatTimelineHour(t);
			yAxis.appendChild(tick);
		}
		board.appendChild(yAxis);

		stages.forEach((stage) => {
			const col = document.createElement("div");
			col.className = "timeline-stage-column";
			col.style.height = `${gridHeight}px`;
			col.style.setProperty("--stage-color", stage.color || "#62b8ff");

			shows
				.filter((s) => s.stageKey === stage.key)
				.forEach((show) => {
					const block = document.createElement("button");
					block.type = "button";
					block.className = "timeline-show";
					block.dataset.show = show.id;
					block.style.top = `${Math.round((show.start - minStart) * pxPerMinute)}px`;
					block.style.height = `${Math.max(
						30,
						Math.round((show.end - show.start) * pxPerMinute)
					)}px`;
					block.innerHTML = `
						<div class="timeline-all-together-indicator" aria-hidden="true"></div>
						<div class="timeline-show-title">${this.escapeHtml(show.title)}</div>
						<div class="timeline-show-time">${this.escapeHtml(show.timeText)}</div>
						<div class="timeline-show-tags"></div>
					`;

					block.addEventListener("click", async (e) => {
						e.stopPropagation();
						if (!this.currentName) return;
						await this.toggleAttendeeById(show.id);
						this.updateTimelineSelections();
					});

					col.appendChild(block);
				});

			board.appendChild(col);
		});

		dayBoard.appendChild(board);
		return dayBoard;
	}

	async toggleAttendeeById(showId) {
		const state = this.getAttendeeState(showId, this.currentName);
		const isAttending =
			this.attendees.has(showId) &&
			this.attendees.get(showId).has(this.currentName) &&
			state !== "deleted";

		if (isAttending) {
			const newState = this.toggleAttendeeState(showId, this.currentName);
			if (newState === "deleted") {
				await this.saveData();
			}
		} else {
			if (state === "deleted") {
				this.toggleAttendeeState(showId, this.currentName);
				await this.saveData();
			} else {
				await this.addAttendee(showId, this.currentName);
			}
		}
		this.renderAttendees();
	}

	updateTimelineSelections() {
		document.querySelectorAll(".timeline-show").forEach((block) => {
			const showId = block.dataset.show;
			const attending = this.currentName ? this.isUserAttending(showId) : false;
			block.classList.toggle("attending", attending);

			const tagsEl = block.querySelector(".timeline-show-tags");
			if (!tagsEl) return;
			tagsEl.innerHTML = "";

			const names = this.getInterestedNames(showId);
			const maxTags = 5;
			names.slice(0, maxTags).forEach((name) => {
				const tag = document.createElement("span");
				tag.className = "timeline-person-tag";
				tag.textContent = this.getInitials(name);
				tag.title = name;
				tag.style.background = this.getPersonColor(name);
				tagsEl.appendChild(tag);
			});

			if (names.length > maxTags) {
				const overflow = document.createElement("span");
				overflow.className = "timeline-person-tag timeline-person-overflow";
				overflow.textContent = `+${names.length - maxTags}`;
				overflow.title = `${names.length - maxTags} more`;
				tagsEl.appendChild(overflow);
			}
		});
	}

	getInterestedNames(showId) {
		if (!this.attendees.has(showId)) return [];
		return Array.from(this.attendees.get(showId)).filter((name) => {
			const state = this.getAttendeeState(showId, name);
			return state !== "deleted";
		});
	}

	getInitials(name) {
		const clean = (name || "").trim();
		if (!clean) return "?";
		return clean[0].toUpperCase();
	}

	createScheduleEmptyState(mode = "my") {
		const isGroup = mode === "group";
		const title = isGroup ? "Group Schedule Is Empty" : "Your Schedule Is Empty";
		const desc = isGroup
			? "No one in the group has marked any shows yet."
			: "Add a few shows first, then switch back to My Schedule.";
		const wrapper = document.createElement("div");
		wrapper.className = "choose-person-message";
		wrapper.innerHTML = `
			<div class="choose-person-content">
				<div class="choose-person-icon">🎧</div>
				<h3>${title}</h3>
				<p>${desc}</p>
				<button class="btn-primary" type="button">Back to All Shows</button>
			</div>
		`;

		const button = wrapper.querySelector("button");
		button.addEventListener("click", () => {
			this.disableMyScheduleAndShowAll();
		});

		return wrapper;
	}

	showScheduleEmptyMessage(mode = "my") {
		this.removeChoosePersonMessage();
		const mainContainer = document.querySelector(".container");
		const festivalGrid = document.querySelector(".festival-grid");
		if (!mainContainer || !festivalGrid) return;

		const messageElement = this.createScheduleEmptyState(mode);
		mainContainer.insertBefore(messageElement, festivalGrid);
	}

	disableMyScheduleAndShowAll() {
		this.setScheduleMode("all");
	}

	showNoResultsMessage(message) {
		this.removeChoosePersonMessage();
		const mainContainer = document.querySelector(".container");
		const festivalGrid = document.querySelector(".festival-grid");
		if (!mainContainer || !festivalGrid) return;

		const messageElement = document.createElement("div");
		messageElement.className = "choose-person-message";
		messageElement.innerHTML = `
			<div class="choose-person-content">
				<div class="choose-person-icon">📭</div>
				<h3>No Shows Found</h3>
				<p>${this.escapeHtml(message)}</p>
			</div>
		`;

		mainContainer.insertBefore(messageElement, festivalGrid);
	}

	// Filter shows to only show those where current user is attending
	filterShowsForMySchedule(section) {
		const shows = section.querySelectorAll(".show");

		shows.forEach((show) => {
			const showId = show.dataset.show;
			let hasCurrentUser = false;

			// Check if the current user is attending this show based on stored data
			if (this.attendees.has(showId)) {
				const attendeeSet = this.attendees.get(showId);
				if (attendeeSet.has(this.currentName)) {
					const state = this.getAttendeeState(showId, this.currentName);
					hasCurrentUser = state !== "deleted";
				}
			}

			if (hasCurrentUser) {
				show.style.display = "block";
				show.style.opacity = "1";
			} else {
				show.style.display = "none";
			}
		});
	}

	// Filter shows to only those where anyone has expressed interest
	filterShowsForGroupSchedule(section) {
		const shows = section.querySelectorAll(".show");
		shows.forEach((show) => {
			const showId = show.dataset.show;
			const hasAnyInterest = this.isGroupInterested(showId);
			show.style.display = hasAnyInterest ? "block" : "none";
			show.style.opacity = hasAnyInterest ? "1" : "0";
		});
	}

	// Show all shows in a section
	showAllShows(section) {
		const shows = section.querySelectorAll(".show");

		shows.forEach((show) => {
			show.style.display = "block";
			show.style.opacity = "1";

			// Add comments functionality if not already present
			this.addCommentsToShow(show);
		});
	}

	// Add comments functionality to an existing show element
	addCommentsToShow(showElement) {
		const showId = showElement.dataset.show;
		if (!showId) return;

		// Check if comments section already exists
		let commentsSection = showElement.querySelector(".comments-section");
		if (!commentsSection) {
			commentsSection = document.createElement("div");
			commentsSection.className = "comments-section";

			// Add comments toggle button
			const commentsToggle = document.createElement("button");
			commentsToggle.className = "comments-toggle-btn";
			const commentCount = this.comments.has(showId)
				? this.comments.get(showId).length
				: 0;

			// Only show the comment count badge if there are comments
			const countBadge =
				commentCount > 0
					? `<span class="comments-count">${commentCount}</span>`
					: "";
			commentsToggle.innerHTML = `
				<span class="comments-icon">💬</span>
				${countBadge}
			`;

			commentsToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				this.toggleComments(showId, showElement);
			});

			commentsSection.appendChild(commentsToggle);
			showElement.appendChild(commentsSection);
		}

		this.addAllTogetherControl(showElement);

		// Prevent comment controls from triggering show click handlers underneath.
		commentsSection.addEventListener("click", (e) => {
			e.stopPropagation();
		});

		// Update the comments count to ensure it's current
		this.updateCommentsCount(showId);
	}

	async toggleAttendee(showElement) {
		const showId = showElement.dataset.show;
		const attendeesContainer = showElement.querySelector(".attendees");

		// Check if attendee is already in this show (including deleted state)
		const existingAttendee = attendeesContainer.querySelector(
			`[data-name="${this.currentName}"]`
		);

		if (existingAttendee) {
			// Toggle state
			const newState = this.toggleAttendeeState(showId, this.currentName);

			if (newState === "deleted") {
				// Remove the element
				existingAttendee.remove();
				await this.saveData();
			} else {
				// Update the element appearance
				this.updateAttendeeElement(
					existingAttendee,
					this.currentName,
					newState
				);
				await this.saveData();
			}
		} else {
			// Check if attendee was previously deleted and is being re-added
			const currentState = this.getAttendeeState(showId, this.currentName);
			if (currentState === "deleted") {
				// Re-add the attendee by toggling the state
				const newState = this.toggleAttendeeState(showId, this.currentName);
				if (newState === "normal") {
					// Let renderAttendees handle the UI update
					this.renderAttendees();
					await this.saveData();
				}
			} else {
				// Add new attendee
				await this.addAttendee(showId, this.currentName);
				// Let renderAttendees handle the UI update
				this.renderAttendees();
			}
		}
	}

	async addAttendee(showId, name) {
		// Optimistic local update so tags appear instantly.
		if (!this.attendees.has(showId)) {
			this.attendees.set(showId, new Set());
		}
		this.attendees.get(showId).add(name);

		if (this.dataService) {
			try {
				await this.dataService.saveAttendee(showId, name, "normal");
			} catch (error) {
				console.error("Failed to save attendee to data service:", error);
			}
		} else {
			// localStorage fallback already updated above
		}

		// Initialize state as normal if not already set
		if (!this.attendeeStates.has(showId)) {
			this.attendeeStates.set(showId, new Map());
		}
		if (!this.attendeeStates.get(showId).has(name)) {
			this.attendeeStates.get(showId).set(name, "normal");
		}

		await this.saveData();
	}

	async removeAttendee(showId, name) {
		// Optimistic local update so tags are removed instantly.
		if (this.attendees.has(showId)) {
			this.attendees.get(showId).delete(name);
			if (this.attendees.get(showId).size === 0) {
				this.attendees.delete(showId);
			}
		}

		if (this.dataService) {
			try {
				await this.dataService.removeAttendee(showId, name);
			} catch (error) {
				console.error("Failed to remove attendee from data service:", error);
			}
		} else {
			// localStorage fallback already updated above
		}

		// Remove from attendee states
		if (this.attendeeStates.has(showId)) {
			this.attendeeStates.get(showId).delete(name);
			if (this.attendeeStates.get(showId).size === 0) {
				this.attendeeStates.delete(showId);
			}
		}

		await this.saveData();
	}

	createAttendeeElement(container, name) {
		const showElement = container.closest(".show");
		const showId = showElement.dataset.show;
		const state = this.getAttendeeState(showId, name);

		// Don't create element if deleted (but allow re-adding through toggleAttendee)
		if (state === "deleted") {
			return;
		}

		const attendeeElement = document.createElement("div");
		attendeeElement.className = "attendee";
		attendeeElement.dataset.name = name;
		attendeeElement.dataset.state = state;

		// Set background color based on person
		const personColor = this.getPersonColor(name);
		attendeeElement.style.background = personColor;

		// Darken color if must-see
		if (state === "must-see") {
			attendeeElement.style.background = this.darkenColor(personColor, 0.3);
			attendeeElement.classList.add("must-see");
		}

		attendeeElement.innerHTML = `
            ${name}
            <span class="remove-icon">×</span>
        `;

		// Handle click events
		attendeeElement.addEventListener("click", async (e) => {
			e.stopPropagation();
			const newState = this.toggleAttendeeState(showId, name);

			if (newState === "deleted") {
				// Remove the element
				attendeeElement.remove();
				await this.saveData();
			} else {
				// Update the element appearance
				this.updateAttendeeElement(attendeeElement, name, newState);
				await this.saveData();
			}
		});

		container.appendChild(attendeeElement);
	}

	// Update attendee element appearance based on state
	updateAttendeeElement(attendeeElement, name, state) {
		const personColor = this.getPersonColor(name);
		attendeeElement.dataset.state = state;

		if (state === "must-see") {
			attendeeElement.style.background = this.darkenColor(personColor, 0.3);
			attendeeElement.classList.add("must-see");
		} else {
			attendeeElement.style.background = personColor;
			attendeeElement.classList.remove("must-see");
		}
	}

	// Helper method to darken a color
	darkenColor(color, amount) {
		// Convert hex to RGB
		const hex = color.replace("#", "");
		const r = parseInt(hex.substr(0, 2), 16);
		const g = parseInt(hex.substr(2, 2), 16);
		const b = parseInt(hex.substr(4, 2), 16);

		// Darken by reducing RGB values
		const darkenedR = Math.max(0, r - r * amount);
		const darkenedG = Math.max(0, g - g * amount);
		const darkenedB = Math.max(0, b - b * amount);

		// Convert back to hex
		const toHex = (c) => {
			const hex = Math.round(c).toString(16);
			return hex.length === 1 ? "0" + hex : hex;
		};

		return `#${toHex(darkenedR)}${toHex(darkenedG)}${toHex(darkenedB)}`;
	}

	async removeAttendeeFromShow(container, attendeeElement, name) {
		const showElement = container.closest(".show");
		const showId = showElement.dataset.show;

		await this.removeAttendee(showId, name);
		attendeeElement.remove();
	}

	renderAttendees() {
		if (!this.scheduleLoaded) {
			// Schedule not loaded yet, wait
			setTimeout(() => this.renderAttendees(), 100);
			return;
		}

		// Render attendees for all shows (stage view)
		document.querySelectorAll(".show").forEach((show) => {
			const showId = show.dataset.show;
			if (!showId) return;

			const attendeesContainer = show.querySelector(".attendees");
			if (!attendeesContainer) return;

			// Clear existing attendees
			attendeesContainer.innerHTML = "";

			// Add attendees if any
			if (this.attendees.has(showId)) {
				this.attendees.get(showId).forEach((attendee) => {
					const state = this.getAttendeeState(showId, attendee);
					if (state !== "deleted") {
						this.createAttendeeElement(attendeesContainer, attendee);
					}
				});
			}

			// Add comments functionality if not already present
			this.addCommentsToShow(show);
		});

		// Render attendees for chronological view
		document.querySelectorAll(".chronological-show").forEach((show) => {
			const showId = show.dataset.show;
			if (!showId) return;

			const attendeesContainer = show.querySelector(
				".chronological-show-attendees"
			);
			if (!attendeesContainer) return;

			// Clear existing attendees
			attendeesContainer.innerHTML = "";

			// Add attendees if any
			if (this.attendees.has(showId)) {
				this.attendees.get(showId).forEach((attendee) => {
					const state = this.getAttendeeState(showId, attendee);
					if (state !== "deleted") {
						const attendeeElement = document.createElement("span");
						attendeeElement.className = "attendee";
						attendeeElement.dataset.name = attendee;
						attendeeElement.dataset.state = state;

						// Set background color based on person
						const personColor = this.getPersonColor(attendee);
						attendeeElement.style.background = personColor;

						// Darken color if must-see
						if (state === "must-see") {
							attendeeElement.style.background = this.darkenColor(
								personColor,
								0.3
							);
							attendeeElement.classList.add("must-see");
						}

						attendeeElement.textContent = attendee;
						attendeesContainer.appendChild(attendeeElement);
					}
				});
			}

			// Ensure comments are also available in chronological cards
			this.addCommentsToShow(show);
		});

		this.updateTimelineSelections();
		this.renderAllTogetherIndicators();
	}

	async saveData() {
		if (!this.dataService) {
			// Fallback to localStorage
			const data = {
				attendees: {},
				attendeeStates: {},
				comments: {},
				allTogetherShows: Array.from(this.allTogetherShows),
			};

			// Save attendees
			this.attendees.forEach((attendeeSet, showId) => {
				data.attendees[showId] = Array.from(attendeeSet);
			});

			// Save attendee states
			this.attendeeStates.forEach((stateMap, showId) => {
				data.attendeeStates[showId] = {};
				stateMap.forEach((state, name) => {
					data.attendeeStates[showId][name] = state;
				});
			});

			// Save comments
			this.comments.forEach((commentArray, showId) => {
				data.comments[showId] = commentArray.map((comment) => ({
					name: comment.name,
					text: comment.text,
					timestamp: comment.timestamp,
				}));
			});

			localStorage.setItem("festivalPlannerData", JSON.stringify(data));
		}

		this.saveAllTogetherFlags();
	}

	async loadData() {
		if (this.dataService) {
			try {
				const data = await this.dataService.getAllData();
				// Data service returns Map objects
				this.attendees = data.attendees || new Map();
				this.attendeeStates = data.attendeeStates || data.states || new Map();
				this.comments = data.comments || new Map();
				this.loadAllTogetherFlags();
			} catch (error) {
				console.error("Error loading data from data service:", error);
				this.attendees = new Map();
				this.attendeeStates = new Map();
				this.comments = new Map();
				this.loadAllTogetherFlags();
			}
		} else {
			// Fallback to localStorage
			const savedData = localStorage.getItem("festivalPlannerData");
			if (savedData) {
				try {
					const data = JSON.parse(savedData);

					// Load attendees
					if (data.attendees) {
						Object.entries(data.attendees).forEach(
							([showId, attendeeArray]) => {
								this.attendees.set(showId, new Set(attendeeArray));
							}
						);
					}

					// Load attendee states
					if (data.attendeeStates) {
						Object.entries(data.attendeeStates).forEach(
							([showId, stateMap]) => {
								this.attendeeStates.set(showId, new Map());
								Object.entries(stateMap).forEach(([name, state]) => {
									this.attendeeStates.get(showId).set(name, state);
								});
							}
						);
					}

					// Load comments
					if (data.comments) {
						Object.entries(data.comments).forEach(([showId, commentArray]) => {
							this.comments.set(
								showId,
								commentArray.map((comment) => ({
									name: comment.name,
									text: comment.text,
									timestamp: comment.timestamp,
								}))
							);
						});
					}

					if (Array.isArray(data.allTogetherShows)) {
						this.allTogetherShows = new Set(data.allTogetherShows);
					} else {
						this.loadAllTogetherFlags();
					}
				} catch (error) {
					console.error("Error loading saved data:", error);
					this.loadAllTogetherFlags();
				}
			} else {
				this.loadAllTogetherFlags();
			}
		}
	}

	showNotification(message, type = "info") {
		// Remove existing notifications
		const existingNotification = document.querySelector(".notification");
		if (existingNotification) {
			existingNotification.remove();
		}

		// Create notification element
		const notification = document.createElement("div");
		notification.className = `notification ${type}`;
		notification.textContent = message;

		// Style the notification
		notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${
							type === "error"
								? "#f56565"
								: type === "success"
								? "#48bb78"
								: "#667eea"
						};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            font-weight: 500;
            animation: slideInRight 0.3s ease-out;
        `;

		// Add animation keyframes if not already present
		if (!document.querySelector("#notification-styles")) {
			const style = document.createElement("style");
			style.id = "notification-styles";
			style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
			document.head.appendChild(style);
		}

		document.body.appendChild(notification);

		// Remove notification after 3 seconds
		setTimeout(() => {
			if (notification.parentNode) {
				notification.style.animation = "slideInRight 0.3s ease-out reverse";
				setTimeout(() => {
					if (notification.parentNode) {
						notification.remove();
					}
				}, 300);
			}
		}, 3000);
	}

	// Method to get all attendees for a specific show
	async getAttendeesForShow(showId) {
		if (this.dataService) {
			return await this.dataService.getAttendeesForShow(showId);
		} else {
			return this.attendees.has(showId)
				? Array.from(this.attendees.get(showId))
				: [];
		}
	}

	// Method to get all shows for a specific attendee
	async getShowsForAttendee(name) {
		if (this.dataService) {
			return await this.dataService.getShowsForAttendee(name);
		} else {
			const shows = [];
			this.attendees.forEach((attendeeSet, showId) => {
				if (attendeeSet.has(name)) {
					shows.push(showId);
				}
			});
			return shows;
		}
	}

	// Method to clear all data
	async clearAllData() {
		if (this.dataService) {
			const success = await this.dataService.clearAllData();
			if (success) {
				this.attendees.clear();
				this.attendeeStates.clear();
				this.comments.clear();
				this.renderAttendees();
				this.showNotification("All data cleared", "success");
			} else {
				this.showNotification("Error clearing data", "error");
			}
		} else {
			this.attendees.clear();
			this.attendeeStates.clear();
			this.comments.clear();
			this.saveData();
			this.renderAttendees();
			this.showNotification("All data cleared", "success");
		}
	}

	// Method to export data
	async exportData() {
		if (this.dataService) {
			const jsonData = await this.dataService.exportData();
			const blob = new Blob([jsonData], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "festival-planner-data.json";
			a.click();
			URL.revokeObjectURL(url);
		} else {
			const data = {
				attendees: {},
				attendeeStates: {},
				comments: {},
				allTogetherShows: Array.from(this.allTogetherShows),
			};

			// Export attendees
			this.attendees.forEach((attendeeSet, showId) => {
				data.attendees[showId] = Array.from(attendeeSet);
			});

			// Export attendee states
			this.attendeeStates.forEach((stateMap, showId) => {
				data.attendeeStates[showId] = {};
				stateMap.forEach((state, name) => {
					data.attendeeStates[showId][name] = state;
				});
			});

			// Export comments
			this.comments.forEach((commentArray, showId) => {
				data.comments[showId] = commentArray.map((comment) => ({
					name: comment.name,
					text: comment.text,
					timestamp: comment.timestamp,
				}));
			});

			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "festival-planner-data.json";
			a.click();
			URL.revokeObjectURL(url);
		}
	}

	// Method to import data
	async importData(jsonData) {
		if (this.dataService) {
			const success = await this.dataService.importData(jsonData);
			if (success) {
				const data = await this.dataService.getAllData();
				this.attendees = data.attendees || new Map();
				this.attendeeStates = data.attendeeStates || data.states || new Map();
				this.comments = data.comments || new Map();
				this.renderAttendees();
				this.showNotification("Data imported successfully", "success");
			} else {
				this.showNotification("Error importing data", "error");
			}
		} else {
			try {
				const data = JSON.parse(jsonData);
				this.attendees.clear();
				this.attendeeStates.clear();
				this.comments.clear();
				this.allTogetherShows.clear();

				// Import attendees
				if (data.attendees) {
					Object.entries(data.attendees).forEach(([showId, attendeeArray]) => {
						this.attendees.set(showId, new Set(attendeeArray));
					});
				}

				// Import attendee states
				if (data.attendeeStates) {
					Object.entries(data.attendeeStates).forEach(([showId, stateMap]) => {
						this.attendeeStates.set(showId, new Map());
						Object.entries(stateMap).forEach(([name, state]) => {
							this.attendeeStates.get(showId).set(name, state);
						});
					});
				}

				// Import comments
				if (data.comments) {
					Object.entries(data.comments).forEach(([showId, commentArray]) => {
						this.comments.set(
							showId,
							commentArray.map((comment) => ({
								name: comment.name,
								text: comment.text,
								timestamp: comment.timestamp,
							}))
						);
					});
				}

				if (Array.isArray(data.allTogetherShows)) {
					data.allTogetherShows.forEach((showId) => {
						this.allTogetherShows.add(showId);
					});
				}

				this.saveData();
				this.renderAttendees();
				this.showNotification("Data imported successfully", "success");
			} catch (error) {
				this.showNotification("Error importing data", "error");
			}
		}
	}

	// Add a comment to a show
	async addComment(showId, name, text) {
		if (!text.trim()) return;

		const comment = {
			name: name,
			text: text.trim(),
			timestamp: new Date().toISOString(),
		};

		if (this.dataService) {
			await this.dataService.saveComment(showId, comment);
		} else {
			// Fallback to localStorage
			if (!this.comments.has(showId)) {
				this.comments.set(showId, []);
			}
			this.comments.get(showId).push(comment);
		}

		await this.saveData();
		this.renderComments(showId);
		this.updateCommentsCount(showId);
	}

	// Delete a comment from a show
	async deleteComment(showId, commentIndex) {
		if (this.dataService) {
			await this.dataService.deleteComment(showId, commentIndex);
		} else {
			// Fallback to localStorage
			if (this.comments.has(showId)) {
				const commentArray = this.comments.get(showId);
				if (commentIndex >= 0 && commentIndex < commentArray.length) {
					commentArray.splice(commentIndex, 1);
					if (commentArray.length === 0) {
						this.comments.delete(showId);
					}
				}
			}
		}

		await this.saveData();
		this.renderComments(showId);
		this.updateCommentsCount(showId);
	}

	// Render comments for a specific show
	renderComments(showId, targetShowElement = null) {
		const showElement =
			targetShowElement ||
			Array.from(document.querySelectorAll(`[data-show="${showId}"]`)).find(
				(el) => el.offsetParent !== null
			) ||
			document.querySelector(`[data-show="${showId}"]`);
		if (!showElement) return;

		let commentsContainer = showElement.querySelector(".comments-container");
		if (!commentsContainer) {
			commentsContainer = document.createElement("div");
			commentsContainer.className = "comments-container";
			showElement.appendChild(commentsContainer);
		}

		commentsContainer.addEventListener("click", (e) => {
			e.stopPropagation();
		});

		commentsContainer.innerHTML = "";

		// Add comment input
		const commentInput = document.createElement("div");
		commentInput.className = "comment-input";
		commentInput.innerHTML = `
			<textarea placeholder="Add a comment..." class="comment-textarea"></textarea>
			<button class="comment-submit-btn">Add Comment</button>
		`;

		commentInput
			.querySelector(".comment-submit-btn")
			.addEventListener("click", async () => {
				const textarea = commentInput.querySelector(".comment-textarea");
				const text = textarea.value;
				if (text.trim() && this.currentName) {
					await this.addComment(showId, this.currentName, text);
					textarea.value = "";
					this.updateCommentsCount(showId);
				} else if (!this.currentName) {
					this.showNotification("Please select your name first", "error");
				}
			});

		commentsContainer.appendChild(commentInput);

		// Add existing comments
		if (this.comments.has(showId) && this.comments.get(showId).length > 0) {
			const commentsList = document.createElement("div");
			commentsList.className = "comments-list";

			this.comments.get(showId).forEach((comment, index) => {
				const commentElement = document.createElement("div");
				commentElement.className = "comment";
				commentElement.innerHTML = `
					<div class="comment-header">
						<span class="comment-author">${this.escapeHtml(comment.name)}</span>
						<span class="comment-time">${this.formatCommentTime(comment.timestamp)}</span>
						${
							comment.name === this.currentName
								? '<button class="comment-delete-btn">×</button>'
								: ""
						}
					</div>
					<div class="comment-text">${this.escapeHtml(comment.text)}</div>
				`;

				// Add delete functionality
				const deleteBtn = commentElement.querySelector(".comment-delete-btn");
				if (deleteBtn) {
					deleteBtn.addEventListener("click", async (e) => {
						e.stopPropagation();
						await this.deleteComment(showId, index);
						this.updateCommentsCount(showId);
					});
				}

				commentsList.appendChild(commentElement);
			});

			commentsContainer.appendChild(commentsList);
		}
	}

	// Format comment timestamp
	formatCommentTime(timestamp) {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now - date;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return "Just now";
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	// Escape HTML to prevent XSS
	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	// Cleanup method
	cleanup() {
		if (this.unsubscribe) {
			this.unsubscribe();
		}
		if (this.commentsUnsubscribe) {
			this.commentsUnsubscribe();
		}
	}

	// Get all shows for chronological view
	getAllShowsForChronological() {
		const shows = [];
		const daySections = document.querySelectorAll(".day-section");

		daySections.forEach((section) => {
			const dayTitle = section.querySelector(".day-title").textContent;
			const dayShows = section.querySelectorAll(".show");

			dayShows.forEach((show) => {
				const showId = show.dataset.show;
				const showTitle = show.querySelector(".show-title").textContent;
				const showTime = show.querySelector(".show-time").textContent;
				const showGenre = show.dataset.genre || "";
				const stageElement = show.closest(".stage");
				const stageName =
					stageElement?.querySelector(".stage-title")?.textContent?.trim() ||
					stageElement?.dataset.stage ||
					"Unknown Stage";
				const rawStageKeySource = stageElement?.dataset.stage || stageName;
				const stageKey = rawStageKeySource
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "");
				const stageColor =
					stageElement?.style.getPropertyValue("--stage-color").trim() || "";

				// Parse time for sorting and handle late-night shows
				const { timeInMinutes } = this.parseTimeForSorting(showTime, dayTitle);
				const dayOrderKey = this.getDaySortKey(dayTitle);

				shows.push({
					id: showId,
					title: showTitle,
					genre: showGenre,
					time: showTime,
					timeInMinutes: timeInMinutes,
					stage: stageKey,
					stageName: stageName,
					stageColor: stageColor,
					day: dayTitle,
					dayOrderKey: dayOrderKey,
					originalDay: dayTitle, // Keep original day for display
					element: show,
				});
			});
		});

		// Sort by day first, then by time
		return shows.sort((a, b) => {
			if (a.dayOrderKey !== b.dayOrderKey) {
				return a.dayOrderKey - b.dayOrderKey;
			}

			// Then sort by time
			return a.timeInMinutes - b.timeInMinutes;
		});
	}

	getDaySortKey(dayLabel) {
		const day = (dayLabel || "").toLowerCase();
		if (day.includes("friday")) return 1;
		if (day.includes("saturday")) return 2;
		if (day.includes("sunday")) return 3;
		return 99;
	}

	// Parse time for sorting (convert to minutes since start of day)
	// Also handles late-night shows (12am-6am) by treating them as part of the next day for sorting
	parseTimeForSorting(timeStr, currentDay) {
		// Handle time ranges like "3:30PM-4:20PM" or "11:30PM-1:00AM"
		const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/);
		if (!timeMatch) return { timeInMinutes: 0, adjustedDay: currentDay };

		let hours = parseInt(timeMatch[1]);
		const minutes = parseInt(timeMatch[2]);
		const period = timeMatch[3];

		// Convert to 24-hour format
		if (period === "PM" && hours !== 12) {
			hours += 12;
		} else if (period === "AM" && hours === 12) {
			hours = 0;
		}

		let adjustedDay = currentDay;
		let timeInMinutes = hours * 60 + minutes;

		// Handle late-night shows (12am-6am) - treat them as part of the next day for sorting
		if (hours >= 0 && hours < 6) {
			// This is a late-night show, adjust the day for sorting purposes
			const dayOrder = { Friday: 1, Saturday: 2, Sunday: 3 };
			const currentDayOrder = dayOrder[currentDay] || 0;

			if (currentDayOrder > 0 && currentDayOrder < 3) {
				// Move to the next day for sorting (but not beyond Sunday)
				const nextDayOrder = currentDayOrder + 1;
				const dayNames = ["Friday", "Saturday", "Sunday"];
				adjustedDay = dayNames[nextDayOrder - 1] || currentDay;

				// Don't add 24 hours - just use the actual time but in the next day context
				// This means 12:30am Friday will be treated as 12:30am Saturday for sorting
			} else if (currentDayOrder === 3) {
				// Sunday late-night shows stay as Sunday but get higher time values
				timeInMinutes += 24 * 60;
			}
		}

		return { timeInMinutes, adjustedDay };
	}

	// Check if user is attending a show
	isUserAttending(showId) {
		const state = this.getAttendeeState(showId, this.currentName);
		return (
			this.attendees.has(showId) &&
			this.attendees.get(showId).has(this.currentName) &&
			state !== "deleted"
		);
	}

	// Create chronological show element
	createChronologicalShowElement(show) {
		const showElement = document.createElement("div");
		showElement.className = "chronological-show";
		showElement.dataset.show = show.id;
		showElement.dataset.stage = show.stage;
		if (show.stageColor) {
			showElement.style.setProperty("--stage-color", show.stageColor);
		}

		// Create artist box with stage color
		const artistBox = document.createElement("div");
		artistBox.className = "artist-box";
		artistBox.dataset.stage = show.stage;
		if (show.stageColor) {
			artistBox.style.background = show.stageColor;
		}
		artistBox.textContent = show.title;

		// Create show info (without duplicate artist name)
		const showInfo = document.createElement("div");
		showInfo.className = "chronological-show-info";
		const stageLabel = show.stageName || show.stage;
		showInfo.innerHTML = `
			<div class="chronological-show-time">${show.time}</div>
			<div class="chronological-show-stage">${this.escapeHtml(stageLabel)}</div>
			${show.genre ? `<div class="genre-tag">${this.escapeHtml(show.genre)}</div>` : ""}
		`;

		// Create attendees section (empty - will be populated by renderAttendees)
		const attendeesSection = document.createElement("div");
		attendeesSection.className = "chronological-show-attendees";

		// Create day badge - use originalDay for display
		const dayBadge = document.createElement("div");
		dayBadge.className = "chronological-show-day";
		dayBadge.textContent = show.originalDay || show.day;

		// Assemble the element - reordered so attendees come before day badge
		showElement.appendChild(artistBox);
		showElement.appendChild(showInfo);
		showElement.appendChild(attendeesSection);
		showElement.appendChild(dayBadge);

		// Add click handler for toggling attendance
		showElement.addEventListener("click", () => {
			if (this.currentName) {
				this.toggleAttendeeForChronological(showElement, show.id);
			}
		});

		this.addAllTogetherControl(showElement);

		return showElement;
	}

	// Toggle attendee for chronological view
	async toggleAttendeeForChronological(showElement, showId) {
		const attendeesSection = showElement.querySelector(
			".chronological-show-attendees"
		);
		const existingAttendee = attendeesSection.querySelector(
			`[data-name="${this.currentName}"]`
		);

		if (existingAttendee) {
			// Toggle state
			const newState = this.toggleAttendeeState(showId, this.currentName);

			if (newState === "deleted") {
				// Remove attendee
				existingAttendee.remove();
				await this.saveData();
			} else {
				// Update appearance
				this.updateAttendeeElement(
					existingAttendee,
					this.currentName,
					newState
				);
			}
		} else {
			// Check if attendee was previously deleted and is being re-added
			const currentState = this.getAttendeeState(showId, this.currentName);
			if (currentState === "deleted") {
				// Re-add the attendee by toggling the state
				const newState = this.toggleAttendeeState(showId, this.currentName);
				if (newState === "normal") {
					// Let renderAttendees handle the UI update
					this.renderAttendees();
					await this.saveData();
				}
			} else {
				// Add new attendee
				await this.addAttendee(showId, this.currentName);
				// Let renderAttendees handle the UI update
				this.renderAttendees();
			}
		}
		await this.saveData(); // Save data after any change
	}

	// Toggle comments visibility for a show
	toggleComments(showId, targetShowElement = null) {
		const showElement =
			targetShowElement ||
			Array.from(document.querySelectorAll(`[data-show="${showId}"]`)).find(
				(el) => el.offsetParent !== null
			) ||
			document.querySelector(`[data-show="${showId}"]`);
		if (!showElement) return;

		let commentsContainer = showElement.querySelector(".comments-container");
		const commentsToggle = showElement.querySelector(".comments-toggle-btn");
		if (!commentsToggle) return;

		if (
			commentsContainer &&
			(commentsContainer.style.display === "block" ||
				commentsContainer.classList.contains("show"))
		) {
			// Hide comments
			commentsContainer.style.display = "none";
			commentsContainer.classList.remove("show");
			commentsToggle.classList.remove("active");
			showElement.classList.remove("comments-open");
		} else {
			// Show comments
			if (!commentsContainer) {
				commentsContainer = document.createElement("div");
				commentsContainer.className = "comments-container";
				showElement.appendChild(commentsContainer);
			}
			commentsContainer.style.display = "block";
			commentsContainer.classList.add("show");
			commentsToggle.classList.add("active");
			showElement.classList.add("comments-open");
			this.renderComments(showId, showElement);
		}
	}

	// Update comments count for a show
	updateCommentsCount(showId) {
		const commentCount = this.comments.has(showId)
			? this.comments.get(showId).length
			: 0;

		// Update all matching cards (stage + chronological view).
		document.querySelectorAll(`[data-show="${showId}"]`).forEach((showElement) => {
			const commentsToggle = showElement.querySelector(".comments-toggle-btn");
			if (!commentsToggle) return;

			// Find existing count badge or create new one
			let commentsCount = commentsToggle.querySelector(".comments-count");

			if (commentCount > 0) {
				// Show count badge
				if (!commentsCount) {
					commentsCount = document.createElement("span");
					commentsCount.className = "comments-count";
					commentsToggle.appendChild(commentsCount);
				}
				commentsCount.textContent = commentCount;
			} else if (commentsCount) {
				// Hide count badge if it exists
				commentsCount.remove();
			}
		});
	}

	// Get color for a person
	getPersonColor(name) {
		return this.personColors[name] || this.personColors["Other"];
	}

	// Get attendee state (normal, must-see, deleted)
	getAttendeeState(showId, name) {
		if (!this.attendeeStates.has(showId)) {
			this.attendeeStates.set(showId, new Map());
		}
		return this.attendeeStates.get(showId).get(name) || "normal";
	}

	// Set attendee state
	setAttendeeState(showId, name, state) {
		if (!this.attendeeStates.has(showId)) {
			this.attendeeStates.set(showId, new Map());
		}
		this.attendeeStates.get(showId).set(name, state);

		// Also save to data service if available
		if (this.dataService) {
			this.dataService.saveAttendeeState(showId, name, state);
		}
	}

	// Toggle attendee state (normal -> must-see -> deleted -> normal)
	toggleAttendeeState(showId, name) {
		const currentState = this.getAttendeeState(showId, name);
		let newState;

		switch (currentState) {
			case "normal":
				newState = "must-see";
				break;
			case "must-see":
				newState = "deleted";
				// Remove from attendees when deleted
				if (this.attendees.has(showId)) {
					this.attendees.get(showId).delete(name);
					if (this.attendees.get(showId).size === 0) {
						this.attendees.delete(showId);
					}
				}
				break;
			case "deleted":
				newState = "normal";
				// Re-add to attendees when restored from deleted state
				if (!this.attendees.has(showId)) {
					this.attendees.set(showId, new Set());
				}
				this.attendees.get(showId).add(name);
				break;
			default:
				newState = "normal";
		}

		this.setAttendeeState(showId, name, newState);
		return newState;
	}

	// Show message to choose a person first when My Schedule is selected but no name is selected
	showChoosePersonMessage() {
		// Remove any existing message first
		this.removeChoosePersonMessage();

		// Get the main container and festival grid
		const mainContainer = document.querySelector(".container");
		const festivalGrid = document.querySelector(".festival-grid");

		// Create the message element
		const messageElement = document.createElement("div");
		messageElement.className = "choose-person-message";
		messageElement.innerHTML = `
			<div class="choose-person-content">
				<div class="choose-person-icon">👤</div>
				<h3>Choose a Person First</h3>
				<p>Please select your name from the dropdown above to view your personal schedule.</p>
				<div class="choose-person-steps">
					<div class="step">
						<span class="step-number">1</span>
						<span class="step-text">Select your name from the dropdown</span>
					</div>
					<div class="step">
						<span class="step-number">2</span>
						<span class="step-text">Switch Schedule to "My Schedule"</span>
					</div>
				</div>
			</div>
		`;

		// Insert the message before the festival grid
		mainContainer.insertBefore(messageElement, festivalGrid);
	}

	// Helper method to check if a show is late-night (12am-6am)
	isLateNightShow(timeStr) {
		const timeMatch = timeStr.match(/(\d+):(\d+)(AM|PM)/);
		if (!timeMatch) return false;

		let hours = parseInt(timeMatch[1]);
		const period = timeMatch[3];

		// Convert to 24-hour format
		if (period === "PM" && hours !== 12) {
			hours += 12;
		} else if (period === "AM" && hours === 12) {
			hours = 0;
		}

		// Check if it's late-night (12am-6am)
		return hours >= 0 && hours < 6;
	}

	isAllTogether(showId) {
		return this.allTogetherShows.has(showId);
	}

	async toggleAllTogether(showId) {
		if (this.isAllTogether(showId)) {
			this.allTogetherShows.delete(showId);
		} else {
			this.allTogetherShows.add(showId);
		}

		this.saveAllTogetherFlags();
		this.renderAllTogetherIndicators();

		const modal = document.getElementById("lockscreenExportModal");
		if (modal?.classList.contains("show")) {
			await this.refreshLockscreenPreview();
		}
	}

	addAllTogetherControl(showElement) {
		const showId = showElement?.dataset?.show;
		if (!showId) return;

		let toggle = showElement.querySelector(".all-together-toggle");
		if (!toggle) {
			toggle = document.createElement("button");
			toggle.type = "button";
			toggle.className = "all-together-toggle";
			toggle.setAttribute("aria-label", "Toggle all-together set");
			toggle.setAttribute("title", "Mark as all-together set");
			toggle.innerHTML = `
				<span class="all-together-toggle-dot"></span>
				<span class="all-together-toggle-text">All-together</span>
			`;
			toggle.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.toggleAllTogether(showId);
			});
			showElement.appendChild(toggle);
		}

		toggle.dataset.show = showId;
	}

	renderAllTogetherIndicators() {
		document.querySelectorAll("[data-show]").forEach((showElement) => {
			const showId = showElement.dataset.show;
			if (!showId) return;

			const active = this.isAllTogether(showId);
			showElement.classList.toggle("all-together-show", active);

			const toggle = showElement.querySelector(".all-together-toggle");
			if (toggle) {
				toggle.classList.toggle("active", active);
				toggle.setAttribute(
					"title",
					active ? "Remove all-together flag" : "Mark as all-together set"
				);
			}

			const timelineBadge = showElement.querySelector(".timeline-all-together-indicator");
			if (timelineBadge) {
				timelineBadge.classList.toggle("active", active);
				timelineBadge.setAttribute(
					"aria-hidden",
					active ? "false" : "true"
				);
			}
		});
	}

	openLockscreenExportModal() {
		const modal = document.getElementById("lockscreenExportModal");
		const daySelect = document.getElementById("lockscreenDaySelect");
		const sourceSelect = document.getElementById("lockscreenSourceSelect");
		const layoutSelect = document.getElementById("lockscreenLayoutSelect");
		if (!modal || !daySelect || !sourceSelect || !layoutSelect) return;

		this.populateLockscreenDayOptions(daySelect);
		sourceSelect.value = "all";
		layoutSelect.value = "chronological";

		modal.classList.add("show");
		modal.setAttribute("aria-hidden", "false");
		document.body.classList.add("modal-open");
		this.refreshLockscreenPreview();
	}

	closeLockscreenExportModal() {
		const modal = document.getElementById("lockscreenExportModal");
		if (!modal) return;
		modal.classList.remove("show");
		modal.setAttribute("aria-hidden", "true");
		document.body.classList.remove("modal-open");
	}

	populateLockscreenDayOptions(selectEl) {
		const availableDays = this.getExportDays();
		selectEl.innerHTML = availableDays
			.map(
				(day) =>
					`<option value="${this.escapeHtml(day.value)}">${this.escapeHtml(
						day.label
					)}</option>`
			)
			.join("");

		const preferred =
			this.currentDay !== "all"
				? availableDays.find((day) => day.value === this.currentDay)
				: availableDays[0];
		if (preferred) {
			selectEl.value = preferred.value;
		}
	}

	getExportDays() {
		const allShows = this.getAllShowsForChronological();
		const seen = new Map();
		allShows.forEach((show) => {
			const key = this.normalizeDayValue(show.originalDay || show.day);
			if (!seen.has(key)) {
				seen.set(key, {
					value: key,
					label: show.originalDay || show.day,
				});
			}
		});
		return Array.from(seen.values()).sort(
			(a, b) => this.getDaySortKey(a.label) - this.getDaySortKey(b.label)
		);
	}

	normalizeDayValue(dayLabel) {
		const day = String(dayLabel || "").toLowerCase();
		if (day.includes("friday")) return "friday";
		if (day.includes("saturday")) return "saturday";
		if (day.includes("sunday")) return "sunday";
		return day.replace(/[^a-z0-9]+/g, "-");
	}

	getLockscreenOptions() {
		return {
			day: document.getElementById("lockscreenDaySelect")?.value || "friday",
			source:
				document.getElementById("lockscreenSourceSelect")?.value || "my",
			layout:
				document.getElementById("lockscreenLayoutSelect")?.value ||
				"chronological",
		};
	}

	async refreshLockscreenPreview() {
		const previewStatus = document.getElementById("lockscreenPreviewStatus");
		const previewImage = document.getElementById("lockscreenPreviewImage");
		const downloadBtn = document.getElementById("downloadLockscreenBtn");
		if (!previewStatus || !previewImage || !downloadBtn) return;

		previewStatus.textContent = "Rendering lockscreen preview...";
		downloadBtn.disabled = true;

		try {
			const result = await this.renderLockscreenExport(this.getLockscreenOptions());
			if (!result.ok) {
				previewImage.removeAttribute("src");
				previewImage.style.display = "none";
				previewStatus.textContent = result.message;
				return;
			}

			if (this.lockscreenPreviewUrl) {
				URL.revokeObjectURL(this.lockscreenPreviewUrl);
			}
			this.lockscreenPreviewUrl = result.url;
			previewImage.src = result.url;
			previewImage.style.display = "block";
			previewStatus.textContent = result.message;
			downloadBtn.disabled = false;
		} catch (error) {
			console.error("Lockscreen preview failed:", error);
			previewImage.removeAttribute("src");
			previewImage.style.display = "none";
			previewStatus.textContent =
				"Preview failed to render. Try refreshing again.";
		}
	}

	async downloadLockscreenExport() {
		const result = await this.renderLockscreenExport(this.getLockscreenOptions());
		if (!result.ok || !result.blob) {
			this.showNotification(result.message || "Export failed", "error");
			return;
		}

		const dayLabel = result.meta?.dayLabel || "schedule";
		const sourceLabel = result.meta?.source || "my";
		const layoutLabel = result.meta?.layout || "chronological";
		const slug = `${dayLabel}-${sourceLabel}-${layoutLabel}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");

		const url = URL.createObjectURL(result.blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `ultra-lockscreen-${slug}.png`;
		link.click();
		URL.revokeObjectURL(url);
		this.showNotification("Lockscreen PNG downloaded", "success");
	}

	async renderLockscreenExport(options) {
		const prepared = this.prepareLockscreenData(options);
		if (!prepared.ok) return prepared;

		await this.waitForFonts();
		const canvas = this.drawLockscreenCanvas(prepared);
		const blob = await new Promise((resolve) =>
			canvas.toBlob(resolve, "image/png")
		);
		if (!blob) {
			return {
				ok: false,
				message: "PNG export is not supported in this browser.",
			};
		}
		const url = URL.createObjectURL(blob);
		return {
			ok: true,
			blob,
			url,
			message: `${prepared.dayLabel} ${prepared.sourceLabel} preview ready.`,
			meta: {
				dayLabel: prepared.dayValue,
				source: prepared.source,
				layout: prepared.layout,
			},
		};
	}

	waitForFonts() {
		if (document.fonts && document.fonts.ready) {
			return document.fonts.ready.catch(() => undefined);
		}
		return Promise.resolve();
	}

	prepareLockscreenData(options) {
		const source =
			options.source === "group"
				? "group"
				: options.source === "all"
				? "all"
				: "my";
		if (source === "my" && !this.currentName) {
			return {
				ok: false,
				message: "Select your name first to export your personal lockscreen.",
			};
		}

		const layout =
			options.layout === "timeline" ? "timeline" : "chronological";
		const dayValue = this.normalizeDayValue(options.day);
		const allShows = this.getAllShowsForChronological();
		const dayShows = allShows.filter(
			(show) => this.normalizeDayValue(show.originalDay || show.day) === dayValue
		);

		const filteredShows = dayShows.filter((show) => {
			if (source === "all") return true;
			if (source === "my") return this.isUserAttending(show.id);
			return this.isGroupInterested(show.id);
		});

		if (!filteredShows.length) {
			return {
				ok: false,
				message:
					source === "my"
						? "No saved sets found for that day."
						: source === "all"
						? "No shows found for that day."
						: "No group-selected sets found for that day.",
			};
		}

		const dayLabel = dayShows[0]?.originalDay || dayValue;
		const entries = filteredShows.map((show) => ({
			id: show.id,
			title: show.title,
			stageName: show.stageName,
			stageColor: show.stageColor || "#62b8ff",
			startTime: this.extractStartTime(show.time),
			timeRange: show.time,
			startMinutes: this.parseClockToMinutes(this.extractStartTime(show.time)) || 0,
			endMinutes: this.getEndMinutesFromRange(show.time),
			allTogether: this.isAllTogether(show.id),
			icons: this.getLockscreenIconsForShow(show.id, source),
		}));

		return {
			ok: true,
			layout,
			source,
			sourceLabel:
				source === "my"
					? "Your Sets"
					: source === "group"
					? "Group Sets"
					: "All Shows",
			dayValue,
			dayLabel,
			entries,
		};
	}

	extractStartTime(timeRange) {
		return String(timeRange || "")
			.split("-")[0]
			.trim();
	}

	getEndMinutesFromRange(timeRange) {
		const parts = String(timeRange || "")
			.split("-")
			.map((part) => part.trim());
		const start = this.parseClockToMinutes(parts[0]);
		let end = this.parseClockToMinutes(parts[1]);
		if (start == null) return 0;
		if (end == null) return start + 60;
		if (end <= start) end += 24 * 60;
		return end;
	}

	getLockscreenIconsForShow(showId, source) {
		if (source === "my") {
			const state = this.getAttendeeState(showId, this.currentName);
			return [
				{
					label: this.getInitials(this.currentName),
					color: this.getPersonColor(this.currentName),
					state,
				},
			];
		}

		const names = this.getInterestedNames(showId).sort((a, b) => {
			const aState = this.getAttendeeState(showId, a) === "must-see" ? 0 : 1;
			const bState = this.getAttendeeState(showId, b) === "must-see" ? 0 : 1;
			if (aState !== bState) return aState - bState;
			return a.localeCompare(b);
		});

		return names.slice(0, 4).map((name) => ({
			label: this.getInitials(name),
			color: this.getPersonColor(name),
			state: this.getAttendeeState(showId, name),
		})).concat(
			names.length > 4
				? [
						{
							label: `+${names.length - 4}`,
							color: "#d7e5ff",
							state: "normal",
						},
				  ]
				: []
		);
	}

	drawLockscreenCanvas(data) {
		const width = 1290;
		const height = 2796;
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");

		const gradient = ctx.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, "#090f2f");
		gradient.addColorStop(0.45, "#070b20");
		gradient.addColorStop(1, "#03040d");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);

		this.drawBackgroundGlow(ctx, width, height);

		const paddingX = 108;
		const topSafe = 360;
		const bottomSafe = 180;
		const contentWidth = width - paddingX * 2;

		ctx.fillStyle = "rgba(255,255,255,0.07)";
		this.roundRect(ctx, paddingX - 18, topSafe - 36, contentWidth + 36, height - topSafe - bottomSafe + 72, 42);
		ctx.fill();

		ctx.fillStyle = "#8ea4d8";
		ctx.font = '600 42px "Rajdhani", sans-serif';
		ctx.textBaseline = "top";
		ctx.fillText("ULTRA LOCKSCREEN", paddingX, topSafe);

		ctx.fillStyle = "#f4f7ff";
		ctx.font = '800 88px "Orbitron", sans-serif';
		ctx.fillText(String(data.dayLabel || "").toUpperCase(), paddingX, topSafe + 54);

		ctx.fillStyle = "#cbd8ff";
		ctx.font = '600 42px "Rajdhani", sans-serif';
		ctx.fillText(
			`${data.sourceLabel}  •  ${data.layout === "timeline" ? "Timeline" : "Chronological"}`,
			paddingX,
			topSafe + 160
		);

		if (data.layout === "timeline") {
			this.drawLockscreenTimeline(ctx, data.entries, {
				x: paddingX,
				y: topSafe + 250,
				width: contentWidth,
				height: height - (topSafe + 250) - bottomSafe,
			});
		} else {
			this.drawLockscreenChronological(ctx, data.entries, {
				x: paddingX,
				y: topSafe + 250,
				width: contentWidth,
				height: height - (topSafe + 250) - bottomSafe,
			});
		}

		ctx.fillStyle = "rgba(210,223,255,0.82)";
		ctx.font = '500 30px "Rajdhani", sans-serif';
		ctx.fillText("Start time only • static screenshot export", paddingX, height - 92);

		return canvas;
	}

	drawBackgroundGlow(ctx, width, height) {
		const glows = [
			{ x: width * 0.2, y: height * 0.1, r: 320, color: "rgba(98,184,255,0.16)" },
			{ x: width * 0.8, y: height * 0.18, r: 380, color: "rgba(181,133,255,0.12)" },
			{ x: width * 0.5, y: height * 0.92, r: 420, color: "rgba(79,167,255,0.08)" },
		];
		glows.forEach((glow) => {
			const radial = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
			radial.addColorStop(0, glow.color);
			radial.addColorStop(1, "rgba(0,0,0,0)");
			ctx.fillStyle = radial;
			ctx.fillRect(glow.x - glow.r, glow.y - glow.r, glow.r * 2, glow.r * 2);
		});
	}

	drawLockscreenChronological(ctx, entries, frame) {
		const count = entries.length;
		const gap = count > 10 ? 18 : 24;
		const usableHeight = frame.height - gap * (count - 1);
		const rowHeight = Math.max(118, Math.min(178, Math.floor(usableHeight / count)));

		entries.forEach((entry, index) => {
			const y = frame.y + index * (rowHeight + gap);
			this.drawLockscreenEntryCard(ctx, entry, {
				x: frame.x,
				y,
				width: frame.width,
				height: rowHeight,
				timeline: false,
			});
		});
	}

	drawLockscreenTimeline(ctx, entries, frame) {
		const sortedStages = [];
		entries.forEach((entry) => {
			if (!sortedStages.find((stage) => stage.name === entry.stageName)) {
				sortedStages.push({
					name: entry.stageName,
					color: entry.stageColor || "#62b8ff",
				});
			}
		});

		const minStart =
			Math.floor(Math.min(...entries.map((entry) => entry.startMinutes)) / 60) * 60;
		const maxEnd =
			Math.ceil(Math.max(...entries.map((entry) => entry.endMinutes)) / 60) * 60;
		const totalMinutes = Math.max(60, maxEnd - minStart);
		const headerHeight = 112;
		const axisWidth = 86;
		const gridY = frame.y + headerHeight;
		const gridHeight = frame.height - headerHeight;
		const pxPerMinute = gridHeight / totalMinutes;
		const columnWidth = (frame.width - axisWidth) / Math.max(sortedStages.length, 1);

		ctx.strokeStyle = "rgba(230,240,255,0.38)";
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(frame.x, frame.y + 68);
		ctx.lineTo(frame.x + frame.width, frame.y + 68);
		ctx.stroke();

		sortedStages.forEach((stage, index) => {
			const x = frame.x + axisWidth + index * columnWidth + 6;
			const width = columnWidth - 12;
			ctx.fillStyle = stage.color;
			this.roundRect(ctx, x, frame.y + 10, width, 78, 18);
			ctx.fill();
			const stageTextColor = this.getContrastTextColor(stage.color);
			ctx.fillStyle = stageTextColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			const lines = this.wrapText(
				ctx,
				stage.name,
				width - 20,
				'700 24px "Rajdhani", sans-serif',
				2
			);
			lines.forEach((line, lineIndex) => {
				this.drawFittedText(
					ctx,
					line,
					x + width / 2,
					frame.y + 35 + lineIndex * 24,
					width - 22,
					24,
					700,
					stageTextColor,
					"Rajdhani"
				);
			});
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
		});

		for (let minute = minStart; minute <= maxEnd; minute += 60) {
			const y = gridY + (minute - minStart) * pxPerMinute;
			ctx.strokeStyle = "rgba(180, 208, 255, 0.16)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(frame.x + axisWidth, y);
			ctx.lineTo(frame.x + frame.width, y);
			ctx.stroke();

			ctx.fillStyle = "#f1f5ff";
			ctx.font = '700 28px "Rajdhani", sans-serif';
			ctx.fillText(this.formatTimelineHour(minute).replace("AM", " AM").replace("PM", " PM"), frame.x + 6, y - 16);
		}

		sortedStages.forEach((stage, index) => {
			const colX = frame.x + axisWidth + index * columnWidth;
			ctx.strokeStyle = "rgba(180, 208, 255, 0.12)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(colX, gridY);
			ctx.lineTo(colX, gridY + gridHeight);
			ctx.stroke();
		});

		entries.forEach((entry) => {
			const stageIndex = sortedStages.findIndex(
				(stage) => stage.name === entry.stageName
			);
			if (stageIndex === -1) return;
			const x = frame.x + axisWidth + stageIndex * columnWidth + 6;
			const width = columnWidth - 12;
			const y = gridY + (entry.startMinutes - minStart) * pxPerMinute + 4;
			const height = Math.max(72, (entry.endMinutes - entry.startMinutes) * pxPerMinute - 8);
			const blockFill = entry.stageColor || "#62b8ff";
			const textColor = this.getContrastTextColor(blockFill);
			const secondaryTextColor =
				textColor === "#081126" ? "rgba(8, 17, 38, 0.78)" : "rgba(248, 251, 255, 0.84)";
			const showIconsInBody = entry.icons.length && height > 118;
			const iconColumnWidth = showIconsInBody ? 40 : 0;
			const textInsetX = 10;
			const bodyTextWidth = width - textInsetX * 2 - iconColumnWidth;

			ctx.fillStyle = blockFill;
			this.roundRect(ctx, x, y, width, height, 14);
			ctx.fill();

			ctx.strokeStyle =
				textColor === "#081126"
					? "rgba(8,17,38,0.28)"
					: "rgba(255,255,255,0.28)";
			ctx.lineWidth = 2;
			this.roundRect(ctx, x, y, width, height, 14);
			ctx.stroke();

			if (entry.allTogether) {
				ctx.fillStyle = "#50e3c2";
				this.roundRect(ctx, x + 8, y + 8, width - 16, 10, 5);
				ctx.fill();
			}

			const titleFontSize = height > 140 ? 24 : height > 100 ? 21 : 18;
			const timeFontSize = height > 140 ? 24 : height > 100 ? 22 : 19;
			const titleLines = this.wrapText(
				ctx,
				entry.title,
				bodyTextWidth,
				`700 ${titleFontSize}px "Rajdhani", sans-serif`,
				height > 130 ? 3 : 2
			);
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			titleLines.forEach((line, lineIndex) => {
				this.drawFittedText(
					ctx,
					line,
					x + (width - iconColumnWidth) / 2,
					y + 18 + lineIndex * (titleFontSize + 4),
					bodyTextWidth,
					titleFontSize,
					700,
					textColor,
					"Rajdhani"
				);
			});

			if (showIconsInBody) {
				const iconTop =
					y + 20 + titleLines.length * (titleFontSize + 4) + 4;
				this.drawHorizontalTimelineIcons(
					ctx,
					entry.icons,
					x + width / 2,
					iconTop,
					textColor
				);
			}

			this.drawFittedText(
				ctx,
				entry.startTime,
				x + width / 2,
				y + height - 38,
				width - 14,
				timeFontSize,
				700,
				secondaryTextColor,
				"Rajdhani"
			);

			ctx.textAlign = "left";
			ctx.textBaseline = "top";
		});
	}

	drawHorizontalTimelineIcons(ctx, icons, centerX, topY) {
		const visibleIcons = icons.slice(0, 3);
		const size = 24;
		const gap = 8;
		const totalWidth =
			visibleIcons.length * size + Math.max(0, visibleIcons.length - 1) * gap;
		const startX = centerX - totalWidth / 2;
		visibleIcons.forEach((icon, index) => {
			const x = startX + index * (size + gap);
			const y = topY;
			ctx.fillStyle =
				icon.state === "must-see"
					? this.darkenColor(icon.color, 0.25)
					: icon.color;
			this.roundRect(ctx, x, y, size, size, 8);
			ctx.fill();
			ctx.fillStyle = "#0a1226";
			ctx.font = '800 12px "Orbitron", sans-serif';
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(icon.label, x + size / 2, y + size / 2 + 1);
		});
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
	}

	drawFittedText(
		ctx,
		text,
		centerX,
		y,
		maxWidth,
		fontSize,
		fontWeight,
		color,
		fontFamily = "Rajdhani"
	) {
		const content = String(text || "");
		ctx.save();
		ctx.fillStyle = color;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
		const measured = ctx.measureText(content).width || 1;
		const scaleX = Math.min(1.18, Math.max(0.82, maxWidth / measured));
		ctx.translate(centerX, y);
		ctx.scale(scaleX, 1);
		ctx.fillText(content, 0, fontSize * 0.5);
		ctx.restore();
	}

	getContrastTextColor(backgroundColor) {
		const rgb = this.parseColorToRgb(backgroundColor);
		if (!rgb) return "#081126";
		const luminance = this.getRelativeLuminance(rgb.r, rgb.g, rgb.b);
		return luminance > 0.52 ? "#081126" : "#f8fbff";
	}

	parseColorToRgb(color) {
		const value = String(color || "").trim();
		if (!value) return null;
		if (value.startsWith("#")) {
			const hex = value.slice(1);
			const normalized =
				hex.length === 3
					? hex
							.split("")
							.map((char) => char + char)
							.join("")
					: hex;
			if (normalized.length !== 6) return null;
			return {
				r: parseInt(normalized.slice(0, 2), 16),
				g: parseInt(normalized.slice(2, 4), 16),
				b: parseInt(normalized.slice(4, 6), 16),
			};
		}
		const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
		if (rgbMatch) {
			const parts = rgbMatch[1].split(",").map((part) => parseFloat(part.trim()));
			if (parts.length >= 3) {
				return { r: parts[0], g: parts[1], b: parts[2] };
			}
		}
		const hslMatch = value.match(/hsla?\(([^)]+)\)/i);
		if (hslMatch) {
			const parts = hslMatch[1]
				.replace(/\//g, " ")
				.split(/[,\s]+/)
				.filter(Boolean);
			if (parts.length >= 3) {
				const h = parseFloat(parts[0]);
				const s = parseFloat(parts[1]) / 100;
				const l = parseFloat(parts[2]) / 100;
				return this.hslToRgb(h, s, l);
			}
		}
		return null;
	}

	hslToRgb(h, s, l) {
		const hue = ((h % 360) + 360) % 360 / 360;
		if (s === 0) {
			const gray = Math.round(l * 255);
			return { r: gray, g: gray, b: gray };
		}
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		const toRgb = (t) => {
			let temp = t;
			if (temp < 0) temp += 1;
			if (temp > 1) temp -= 1;
			if (temp < 1 / 6) return p + (q - p) * 6 * temp;
			if (temp < 1 / 2) return q;
			if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
			return p;
		};
		return {
			r: Math.round(toRgb(hue + 1 / 3) * 255),
			g: Math.round(toRgb(hue) * 255),
			b: Math.round(toRgb(hue - 1 / 3) * 255),
		};
	}

	getRelativeLuminance(r, g, b) {
		const transform = (channel) => {
			const normalized = channel / 255;
			return normalized <= 0.03928
				? normalized / 12.92
				: ((normalized + 0.055) / 1.055) ** 2.4;
		};
		const rr = transform(r);
		const gg = transform(g);
		const bb = transform(b);
		return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
	}

	drawLockscreenEntryCard(ctx, entry, frame) {
		ctx.fillStyle = "rgba(8,14,37,0.88)";
		this.roundRect(ctx, frame.x, frame.y, frame.width, frame.height, 32);
		ctx.fill();

		ctx.strokeStyle = "rgba(132,173,255,0.18)";
		ctx.lineWidth = 2;
		this.roundRect(ctx, frame.x, frame.y, frame.width, frame.height, 32);
		ctx.stroke();

		if (entry.allTogether) {
			ctx.fillStyle = "rgba(80, 227, 194, 0.22)";
			this.roundRect(ctx, frame.x, frame.y, frame.width, frame.height, 32);
			ctx.fill();

			ctx.fillStyle = "#50e3c2";
			this.roundRect(ctx, frame.x + 22, frame.y + 20, 132, 30, 15);
			ctx.fill();
			ctx.fillStyle = "#07241f";
			ctx.font = '700 18px "Rajdhani", sans-serif';
			ctx.textBaseline = "middle";
			ctx.fillText("ALL TOGETHER", frame.x + 36, frame.y + 35);
			ctx.textBaseline = "top";
		}

		const timeWidth = 185;
		const padX = 32;
		const textX = frame.x + timeWidth + 28;
		const iconAreaWidth = entry.icons.length ? 132 : 0;
		const availableTextWidth = frame.width - timeWidth - 60 - iconAreaWidth;
		const titleStartY = frame.y + (entry.allTogether ? 58 : 20);
		const titleLines = this.wrapText(
			ctx,
			entry.title,
			Math.max(260, availableTextWidth - 8),
			'700 42px "Rajdhani", sans-serif',
			2
		);

		ctx.fillStyle = "#7ad0ff";
		ctx.font = '700 34px "Rajdhani", sans-serif';
		ctx.textBaseline = "top";
		ctx.fillText(entry.startTime, frame.x + padX, frame.y + 26);

		if (entry.icons.length) {
			this.drawInterestIconsRight(
				ctx,
				entry.icons,
				frame.x + frame.width - 28,
				frame.y + frame.height / 2
			);
		}

		ctx.fillStyle = "#f3f7ff";
		ctx.font = '700 42px "Rajdhani", sans-serif';
		titleLines.forEach((line, lineIndex) => {
			ctx.fillText(line, textX, titleStartY + lineIndex * 42);
		});

		ctx.fillStyle = "#b0c1eb";
		ctx.font = '600 30px "Rajdhani", sans-serif';
		const stageY =
			frame.y +
			Math.min(frame.height - 52, titleStartY - frame.y + titleLines.length * 42 + 18);
		ctx.fillText(entry.stageName, textX, stageY);
	}

	drawInterestIcons(ctx, icons, x, baselineY) {
		const chipWidth = 48;
		const chipHeight = 34;
		const gap = 12;
		icons.forEach((icon, index) => {
			const chipX = x + index * (chipWidth + gap);
			const chipY = baselineY - chipHeight;
			ctx.fillStyle = icon.state === "must-see"
				? this.darkenColor(icon.color, 0.25)
				: icon.color;
			this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 17);
			ctx.fill();

			if (icon.state === "must-see") {
				ctx.strokeStyle = "rgba(255,220,132,0.95)";
				ctx.lineWidth = 2;
				this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 17);
				ctx.stroke();
				ctx.fillStyle = "#ffd978";
				ctx.font = '700 16px "Rajdhani", sans-serif';
				ctx.fillText("★", chipX + chipWidth - 16, chipY - 2);
			}

			ctx.fillStyle = "#081126";
			ctx.font = '800 18px "Orbitron", sans-serif';
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(icon.label, chipX + chipWidth / 2, chipY + chipHeight / 2 + 1);
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
		});
	}

	drawInterestIconsRight(ctx, icons, rightX, centerY) {
		const visibleIcons = icons.slice(0, 4);
		const chipWidth = 48;
		const chipHeight = 34;
		const gap = 10;
		const totalHeight =
			visibleIcons.length * chipHeight +
			Math.max(0, visibleIcons.length - 1) * gap;
		const topY = centerY - totalHeight / 2;

		visibleIcons.forEach((icon, index) => {
			const chipX = rightX - chipWidth;
			const chipY = topY + index * (chipHeight + gap);
			ctx.fillStyle =
				icon.state === "must-see"
					? this.darkenColor(icon.color, 0.25)
					: icon.color;
			this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 17);
			ctx.fill();

			if (icon.state === "must-see") {
				ctx.strokeStyle = "rgba(255,220,132,0.95)";
				ctx.lineWidth = 2;
				this.roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 17);
				ctx.stroke();
			}

			ctx.fillStyle = "#081126";
			ctx.font = '800 18px "Orbitron", sans-serif';
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(icon.label, chipX + chipWidth / 2, chipY + chipHeight / 2 + 1);
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
		});
	}

	wrapText(ctx, text, maxWidth, font, maxLines = 2) {
		ctx.font = font;
		const words = String(text || "").split(/\s+/).filter(Boolean);
		const lines = [];
		let current = "";

		words.forEach((word) => {
			const test = current ? `${current} ${word}` : word;
			if (ctx.measureText(test).width <= maxWidth || !current) {
				current = test;
			} else {
				lines.push(current);
				current = word;
			}
		});
		if (current) lines.push(current);

		if (lines.length <= maxLines) return lines;
		const trimmed = lines.slice(0, maxLines);
		while (
			trimmed[trimmed.length - 1] &&
			ctx.measureText(`${trimmed[trimmed.length - 1]}…`).width > maxWidth
		) {
			trimmed[trimmed.length - 1] = trimmed[trimmed.length - 1].slice(0, -1);
		}
		trimmed[trimmed.length - 1] = `${trimmed[trimmed.length - 1]}…`;
		return trimmed;
	}

	roundRect(ctx, x, y, width, height, radius) {
		const r = Math.min(radius, width / 2, height / 2);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + width, y, x + width, y + height, r);
		ctx.arcTo(x + width, y + height, x, y + height, r);
		ctx.arcTo(x, y + height, x, y, r);
		ctx.arcTo(x, y, x + width, y, r);
		ctx.closePath();
	}
}

// Initialize the festival planner when the DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
	window.festivalPlanner = new FestivalPlanner();
});

// Add some helpful keyboard shortcuts
document.addEventListener("keydown", async (e) => {
	if (e.key === "Escape" && window.festivalPlanner) {
		window.festivalPlanner.closeLockscreenExportModal();
	}

	if (e.ctrlKey || e.metaKey) {
		switch (e.key) {
			case "s":
				e.preventDefault();
				if (window.festivalPlanner) {
					await window.festivalPlanner.saveData();
					window.festivalPlanner.showNotification("Data saved", "success");
				}
				break;
			case "e":
				e.preventDefault();
				if (window.festivalPlanner) {
					await window.festivalPlanner.exportData();
				}
				break;
		}
	}
});

// Cleanup when page is unloaded
window.addEventListener("beforeunload", () => {
	if (window.festivalPlanner) {
		window.festivalPlanner.cleanup();
	}
});

// Add a small help tooltip
document.addEventListener("DOMContentLoaded", () => {
	const helpText = document.createElement("div");
	helpText.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        opacity: 0.7;
        transition: opacity 0.3s ease;
        z-index: 1000;
    `;
	helpText.innerHTML = `
        💡 Tip: Enter your name, then click on shows to add/remove yourself
    `;

	helpText.addEventListener("mouseenter", () => {
		helpText.style.opacity = "1";
	});

	helpText.addEventListener("mouseleave", () => {
		helpText.style.opacity = "0.7";
	});

	document.body.appendChild(helpText);

	// Remove help text after 10 seconds
	setTimeout(() => {
		if (helpText.parentNode) {
			helpText.style.opacity = "0";
			setTimeout(() => {
				if (helpText.parentNode) {
					helpText.remove();
				}
			}, 300);
		}
	}, 10000);
});
