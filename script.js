class FestivalPlanner {
	constructor() {
		this.attendees = new Map(); // Map of showId to Set of attendee names
		this.attendeeStates = new Map(); // Map of showId to Map of name to state
		this.comments = new Map(); // Map of showId to Array of comment objects
		this.currentName = null;
		this.currentDay = "all";
		this.showMySchedule = false;
		this.showChronological = false;
		this.scheduleLoaded = false;
		this.firebaseService = null;
		this.unsubscribe = null;

		// Unique colors for each person
		this.personColors = {
			Jess: "#FF6B6B", // Coral Red
			Theo: "#4ECDC4", // Turquoise
			Andy: "#45B7D1", // Sky Blue
			Noel: "#96CEB4", // Mint Green
			Kevin: "#FFEAA7", // Light Yellow
			Ellen: "#DDA0DD", // Plum
			PJ: "#98D8C8", // Seafoam Green
			Other: "#F7DC6F", // Golden Yellow for custom names
		};

		this.init();
	}

	async init() {
		// Wait for Firebase to be available
		let attempts = 0;
		const maxAttempts = 50; // Wait up to 5 seconds (50 * 100ms)

		while (!window.FirebaseService && attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			attempts++;
		}

		// Initialize Firebase service
		if (window.FirebaseService) {
			try {
				this.firebaseService = new window.FirebaseService();

				// Test Firebase connection
				const connectionTest = await this.firebaseService.testConnection();
				if (!connectionTest) {
					console.warn(
						"Firebase connection test failed, falling back to localStorage"
					);
					console.warn(
						"This is normal for deployed versions if the domain is not authorized in Firebase project settings."
					);

					// Run diagnostics to help identify the issue
					const issues = await this.firebaseService.diagnoseIssues();
					if (issues.length > 0) {
						console.warn("Firebase deployment issues detected:");
						issues.forEach((issue) => console.warn("- " + issue));
					}

					this.firebaseService = null;
					this.loadData();
				} else {
					await this.loadData();
					this.setupRealTimeListener();
					console.log("Firebase initialized successfully");
				}
			} catch (error) {
				console.error("Error initializing Firebase service:", error);
				console.warn(
					"Falling back to localStorage due to Firebase initialization error"
				);
				this.firebaseService = null;
				this.loadData();
			}
		} else {
			console.warn("Firebase not available, falling back to localStorage");
			console.warn(
				"This is normal for deployed versions if Firebase is not configured or the domain is not authorized."
			);
			this.loadData();
		}
		this.setupEventListeners();

		// Wait for schedule to load before rendering
		this.waitForSchedule();
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
		if (this.firebaseService) {
			this.unsubscribe = this.firebaseService.onAttendeesChange(
				(attendeesMap, statesMap) => {
					this.attendees = attendeesMap;
					this.attendeeStates = statesMap;
					this.renderAttendees();
				}
			);

			// Set up comments listener
			this.commentsUnsubscribe = this.firebaseService.onCommentsChange(
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

		// Handle My Schedule toggle
		const myScheduleToggle = document.getElementById("myScheduleToggle");
		if (myScheduleToggle) {
			myScheduleToggle.addEventListener("click", () => {
				this.toggleMySchedule();
			});
		}

		// Handle Chronological toggle
		const chronologicalToggle = document.getElementById("chronologicalToggle");
		if (chronologicalToggle) {
			chronologicalToggle.addEventListener("click", () => {
				this.toggleChronological();
			});
		}

		// Show click functionality - use event delegation for dynamic content
		document.addEventListener("click", (e) => {
			const show = e.target.closest(".show");
			if (show && this.currentName) {
				this.toggleAttendee(show);
			}
		});

		// Focus on name select when page loads
		nameSelect.focus();
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

	// Toggle My Schedule view
	toggleMySchedule() {
		this.showMySchedule = !this.showMySchedule;
		const myScheduleToggle = document.getElementById("myScheduleToggle");

		if (this.showMySchedule) {
			myScheduleToggle.classList.add("active");
			myScheduleToggle.textContent = "All Shows";
		} else {
			myScheduleToggle.classList.remove("active");
			myScheduleToggle.textContent = "My Schedule";
			// Remove the choose person message when switching away from My Schedule
			this.removeChoosePersonMessage();
		}

		// Apply filters
		this.applyFilters();
	}

	// Toggle Chronological view
	toggleChronological() {
		this.showChronological = !this.showChronological;
		const chronologicalToggle = document.getElementById("chronologicalToggle");

		if (this.showChronological) {
			chronologicalToggle.classList.add("active");
			chronologicalToggle.textContent = "Stage View";
		} else {
			chronologicalToggle.classList.remove("active");
			chronologicalToggle.textContent = "Chronological";
		}

		// Apply filters
		this.applyFilters();
	}

	// Apply current filters (day, My Schedule, and Chronological)
	applyFilters() {
		// Remove the choose person message if a person is selected
		if (this.currentName) {
			this.removeChoosePersonMessage();
		}

		if (this.showChronological) {
			this.showChronologicalView();
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

		// Remove any existing choose person message
		this.removeChoosePersonMessage();

		// Check if My Schedule is enabled but no name is selected
		if (this.showMySchedule && !this.currentName) {
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

		// Then, filter by My Schedule if enabled
		if (this.showMySchedule && this.currentName) {
			filteredShows = filteredShows.filter((show) =>
				this.isUserAttending(show.id)
			);
		}

		// Create chronological show elements
		filteredShows.forEach((show) => {
			const showElement = this.createChronologicalShowElement(show);
			chronologicalView.appendChild(showElement);
		});

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

		// Remove any existing choose person message
		this.removeChoosePersonMessage();

		// Check if My Schedule is enabled but no name is selected
		if (this.showMySchedule && !this.currentName) {
			this.showChoosePersonMessage();
			return;
		}

		// Show day sections based on current filters
		const daySections = document.querySelectorAll(".day-section");

		// If My Schedule is enabled, we need to show only the selected day that has shows the user is attending
		if (this.showMySchedule && this.currentName) {
			// First, get all shows the current user is attending
			const userShows = new Set();
			this.attendees.forEach((attendeeSet, showId) => {
				if (attendeeSet.has(this.currentName)) {
					const state = this.getAttendeeState(showId, this.currentName);
					if (state !== "deleted") {
						userShows.add(showId);
					}
				}
			});

			// Show/hide day sections based on current day selection and whether they contain user's shows
			daySections.forEach((section) => {
				const dayTitle = section
					.querySelector(".day-title")
					.textContent.toLowerCase();
				const shouldShowDay =
					this.currentDay === "all" || dayTitle.includes(this.currentDay);

				if (shouldShowDay) {
					const shows = section.querySelectorAll(".show");
					let hasUserShows = false;

					// Check if this section has any shows the user is attending
					shows.forEach((show) => {
						const showId = show.dataset.show;
						if (userShows.has(showId)) {
							hasUserShows = true;
						}
					});

					if (hasUserShows) {
						section.style.display = "block";
						// Only show the shows the user is attending
						this.filterShowsForMySchedule(section);
						// No sorting - preserve original order
					} else {
						section.style.display = "none";
					}
				} else {
					section.style.display = "none";
				}
			});
		} else {
			// Normal day filtering
			daySections.forEach((section) => {
				const dayTitle = section
					.querySelector(".day-title")
					.textContent.toLowerCase();
				const shouldShowDay =
					this.currentDay === "all" || dayTitle.includes(this.currentDay);

				if (shouldShowDay) {
					section.style.display = "block";
					this.showAllShows(section);
					// No sorting - preserve original order
				} else {
					section.style.display = "none";
				}
			});
		}
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
				this.toggleComments(showId);
			});

			commentsSection.appendChild(commentsToggle);
			showElement.appendChild(commentsSection);
		}

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
		if (this.firebaseService) {
			await this.firebaseService.saveAttendee(showId, name, "normal");
		} else {
			// Fallback to localStorage
			if (!this.attendees.has(showId)) {
				this.attendees.set(showId, new Set());
			}
			this.attendees.get(showId).add(name);
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
		if (this.firebaseService) {
			await this.firebaseService.removeAttendee(showId, name);
		} else {
			// Fallback to localStorage
			if (this.attendees.has(showId)) {
				this.attendees.get(showId).delete(name);
				if (this.attendees.get(showId).size === 0) {
					this.attendees.delete(showId);
				}
			}
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
		});
	}

	async saveData() {
		if (!this.firebaseService) {
			// Fallback to localStorage
			const data = {
				attendees: {},
				attendeeStates: {},
				comments: {},
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
	}

	async loadData() {
		if (this.firebaseService) {
			try {
				const data = await this.firebaseService.getAllData();
				// Firebase returns Map objects, so we need to handle them properly
				this.attendees = data.attendees || new Map();
				this.attendeeStates = data.attendeeStates || new Map();
				this.comments = data.comments || new Map();
			} catch (error) {
				console.error("Error loading data from Firebase:", error);
				this.attendees = new Map();
				this.attendeeStates = new Map();
				this.comments = new Map();
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
				} catch (error) {
					console.error("Error loading saved data:", error);
				}
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
		if (this.firebaseService) {
			return await this.firebaseService.getAttendeesForShow(showId);
		} else {
			return this.attendees.has(showId)
				? Array.from(this.attendees.get(showId))
				: [];
		}
	}

	// Method to get all shows for a specific attendee
	async getShowsForAttendee(name) {
		if (this.firebaseService) {
			return await this.firebaseService.getShowsForAttendee(name);
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
		if (this.firebaseService) {
			const success = await this.firebaseService.clearAllData();
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
		if (this.firebaseService) {
			const jsonData = await this.firebaseService.exportData();
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
		if (this.firebaseService) {
			const success = await this.firebaseService.importData(jsonData);
			if (success) {
				const data = await this.firebaseService.getAllData();
				this.attendees = new Map(Object.entries(data.attendees));
				this.attendeeStates = new Map(Object.entries(data.attendeeStates));
				this.comments = new Map(Object.entries(data.comments));
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

		if (this.firebaseService) {
			await this.firebaseService.saveComment(showId, comment);
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
		if (this.firebaseService) {
			await this.firebaseService.deleteComment(showId, commentIndex);
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
	renderComments(showId) {
		const showElement = document.querySelector(`[data-show="${showId}"]`);
		if (!showElement) return;

		let commentsContainer = showElement.querySelector(".comments-container");
		if (!commentsContainer) {
			commentsContainer = document.createElement("div");
			commentsContainer.className = "comments-container";
			showElement.appendChild(commentsContainer);
		}

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
				const stageElement = show.closest(".stage");
				const stage = stageElement ? stageElement.dataset.stage : "unknown";

				// Parse time for sorting and handle late-night shows
				const { timeInMinutes, adjustedDay } = this.parseTimeForSorting(
					showTime,
					dayTitle
				);

				shows.push({
					id: showId,
					title: showTitle,
					time: showTime,
					timeInMinutes: timeInMinutes,
					stage: stage,
					day: adjustedDay, // Use adjusted day for sorting
					originalDay: dayTitle, // Keep original day for display
					element: show,
				});
			});
		});

		// Sort by day first, then by time
		return shows.sort((a, b) => {
			// First sort by day
			const dayOrder = { Friday: 1, Saturday: 2, Sunday: 3 };
			const dayA = dayOrder[a.day] || 0;
			const dayB = dayOrder[b.day] || 0;

			if (dayA !== dayB) {
				return dayA - dayB;
			}

			// Then sort by time
			return a.timeInMinutes - b.timeInMinutes;
		});
	}

	// Parse time for sorting (convert to minutes since start of day)
	// Also handles late-night shows (12am-6am) by treating them as part of the next day for sorting
	parseTimeForSorting(timeStr, currentDay) {
		// Handle time ranges like "3:30PM-4:20PM" or "11:30PM-1:00AM"
		const timeMatch = timeStr.match(/(\d+):(\d+)(AM|PM)/);
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

		// Create artist box with stage color
		const artistBox = document.createElement("div");
		artistBox.className = `artist-box ${show.stage}`;
		artistBox.textContent = show.title;

		// Create show info (without duplicate artist name)
		const showInfo = document.createElement("div");
		showInfo.className = "chronological-show-info";
		showInfo.innerHTML = `
			<div class="chronological-show-time">${show.time}</div>
			<div class="chronological-show-stage">${show.stage} Stage</div>
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
	toggleComments(showId) {
		const showElement = document.querySelector(`[data-show="${showId}"]`);
		if (!showElement) return;

		let commentsContainer = showElement.querySelector(".comments-container");
		const commentsToggle = showElement.querySelector(".comments-toggle-btn");

		if (
			commentsContainer &&
			(commentsContainer.style.display === "block" ||
				commentsContainer.classList.contains("show"))
		) {
			// Hide comments
			commentsContainer.style.display = "none";
			commentsContainer.classList.remove("show");
			commentsToggle.classList.remove("active");
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
			this.renderComments(showId);
		}
	}

	// Update comments count for a show
	updateCommentsCount(showId) {
		const showElement = document.querySelector(`[data-show="${showId}"]`);
		if (!showElement) return;

		const commentsToggle = showElement.querySelector(".comments-toggle-btn");
		if (!commentsToggle) return;

		const commentCount = this.comments.has(showId)
			? this.comments.get(showId).length
			: 0;

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
		} else {
			// Hide count badge if it exists
			if (commentsCount) {
				commentsCount.remove();
			}
		}
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

		// Also save to Firebase if available
		if (this.firebaseService) {
			this.firebaseService.saveAttendeeState(showId, name, state);
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

	// Show message to choose a person first when My Schedule is enabled but no name is selected
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
						<span class="step-text">Click "My Schedule" to see your shows</span>
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
}

// Initialize the festival planner when the DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
	window.festivalPlanner = new FestivalPlanner();
});

// Add some helpful keyboard shortcuts
document.addEventListener("keydown", async (e) => {
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
