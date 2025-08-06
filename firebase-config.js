// Firebase configuration and initialization
let FirebaseService = null;

// Function to initialize Firebase
async function initializeFirebase() {
	try {
		// Import Firebase modules
		const { initializeApp } = await import(
			"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
		);
		const {
			getFirestore,
			collection,
			doc,
			setDoc,
			getDoc,
			getDocs,
			deleteDoc,
			onSnapshot,
		} = await import(
			"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
		);

		// Your Firebase configuration object
		// Replace these values with your actual Firebase project configuration
		// NOTE: These are public keys and are safe to expose in client-side code
		// Firebase security is handled through Firestore Security Rules and Authentication
		const firebaseConfig = {
			apiKey: "REDACTED_FIREBASE_API_KEY",
			authDomain: "elements-0.firebaseapp.com",
			projectId: "elements-0",
			storageBucket: "elements-0.firebasestorage.app",
			messagingSenderId: "738816284498",
			appId: "1:738816284498:web:9ec55c7a5c4e10d8e38c8b",
			measurementId: "G-SML6M24HHY",
		};

		// Initialize Firebase
		const app = initializeApp(firebaseConfig);
		const db = getFirestore(app);

		// Database collections
		const COLLECTIONS = {
			ATTENDEES: "attendees",
			SHOWS: "shows",
			FESTIVAL_DATA: "festival_data",
			COMMENTS: "comments",
		};

		// Firebase service class
		return class {
			constructor() {
				this.db = db;
				this.collections = COLLECTIONS;
			}

			// Save attendee data for a specific show
			async saveAttendee(showId, attendeeName, state = "normal") {
				try {
					const docRef = doc(
						this.db,
						this.collections.ATTENDEES,
						`${showId}_${attendeeName}`
					);
					await setDoc(docRef, {
						showId: showId,
						attendeeName: attendeeName,
						state: state,
						timestamp: new Date().toISOString(),
					});
					return true;
				} catch (error) {
					console.error("Error saving attendee:", error);
					return false;
				}
			}

			// Save attendee state for a specific show
			async saveAttendeeState(showId, attendeeName, state) {
				try {
					const docRef = doc(
						this.db,
						this.collections.ATTENDEES,
						`${showId}_${attendeeName}`
					);
					await setDoc(
						docRef,
						{
							showId: showId,
							attendeeName: attendeeName,
							state: state,
							timestamp: new Date().toISOString(),
						},
						{ merge: true }
					);
					return true;
				} catch (error) {
					console.error("Error saving attendee state:", error);
					return false;
				}
			}

			// Remove attendee from a show
			async removeAttendee(showId, attendeeName) {
				try {
					const docRef = doc(
						this.db,
						this.collections.ATTENDEES,
						`${showId}_${attendeeName}`
					);
					await deleteDoc(docRef);
					return true;
				} catch (error) {
					console.error("Error removing attendee:", error);
					return false;
				}
			}

			// Get all attendees for a specific show
			async getAttendeesForShow(showId) {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.ATTENDEES)
					);
					const attendees = [];
					querySnapshot.forEach((doc) => {
						const data = doc.data();
						if (data.showId === showId) {
							attendees.push(data.attendeeName);
						}
					});
					return attendees;
				} catch (error) {
					console.error("Error getting attendees for show:", error);
					return [];
				}
			}

			// Get all shows for a specific attendee
			async getShowsForAttendee(attendeeName) {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.ATTENDEES)
					);
					const shows = [];
					querySnapshot.forEach((doc) => {
						const data = doc.data();
						if (data.attendeeName === attendeeName) {
							shows.push(data.showId);
						}
					});
					return shows;
				} catch (error) {
					console.error("Error getting shows for attendee:", error);
					return [];
				}
			}

			// Get all attendees data as a Map
			async getAllAttendeesData() {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.ATTENDEES)
					);
					const attendeesMap = new Map();

					querySnapshot.forEach((doc) => {
						const data = doc.data();
						if (!attendeesMap.has(data.showId)) {
							attendeesMap.set(data.showId, new Set());
						}
						attendeesMap.get(data.showId).add(data.attendeeName);
					});

					return attendeesMap;
				} catch (error) {
					console.error("Error getting all attendees data:", error);
					return new Map();
				}
			}

			// Get all attendee states data as a Map
			async getAllAttendeeStates() {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.ATTENDEES)
					);
					const statesMap = new Map();

					querySnapshot.forEach((doc) => {
						const data = doc.data();
						if (!statesMap.has(data.showId)) {
							statesMap.set(data.showId, new Map());
						}
						// Default state is "normal" if not specified
						statesMap
							.get(data.showId)
							.set(data.attendeeName, data.state || "normal");
					});

					return statesMap;
				} catch (error) {
					console.error("Error getting all attendee states data:", error);
					return new Map();
				}
			}

			// Get all data (attendees, states, comments)
			async getAllData() {
				try {
					const [attendeesData, statesData, commentsData] = await Promise.all([
						this.getAllAttendeesData(),
						this.getAllAttendeeStates(),
						this.getAllCommentsData(),
					]);

					return {
						attendees: attendeesData,
						attendeeStates: statesData,
						comments: commentsData,
					};
				} catch (error) {
					console.error("Error getting all data:", error);
					return {
						attendees: new Map(),
						attendeeStates: new Map(),
						comments: new Map(),
					};
				}
			}

			// Save comment
			async saveComment(showId, comment) {
				try {
					const docRef = doc(
						this.db,
						this.collections.COMMENTS,
						`${showId}_${comment.timestamp}_${comment.name}`
					);
					await setDoc(docRef, {
						showId: showId,
						name: comment.name,
						text: comment.text,
						timestamp: comment.timestamp,
					});
					return true;
				} catch (error) {
					console.error("Error saving comment:", error);
					return false;
				}
			}

			// Delete comment
			async deleteComment(showId, commentIndex) {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.COMMENTS)
					);
					let currentIndex = 0;

					for (const docSnapshot of querySnapshot.docs) {
						const data = docSnapshot.data();
						if (data.showId === showId) {
							if (currentIndex === commentIndex) {
								await deleteDoc(docSnapshot.ref);
								return true;
							}
							currentIndex++;
						}
					}
					return false;
				} catch (error) {
					console.error("Error deleting comment:", error);
					return false;
				}
			}

			// Get all comments data as a Map
			async getAllCommentsData() {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.COMMENTS)
					);
					const commentsMap = new Map();

					querySnapshot.forEach((doc) => {
						const data = doc.data();
						if (!commentsMap.has(data.showId)) {
							commentsMap.set(data.showId, []);
						}
						commentsMap.get(data.showId).push({
							name: data.name,
							text: data.text,
							timestamp: data.timestamp,
						});
					});

					return commentsMap;
				} catch (error) {
					console.error("Error getting all comments data:", error);
					return new Map();
				}
			}

			// Listen to real-time changes in attendees data
			onAttendeesChange(callback) {
				return onSnapshot(
					collection(this.db, this.collections.ATTENDEES),
					(snapshot) => {
						const attendeesMap = new Map();
						const statesMap = new Map();

						snapshot.forEach((doc) => {
							const data = doc.data();
							if (!attendeesMap.has(data.showId)) {
								attendeesMap.set(data.showId, new Set());
							}
							attendeesMap.get(data.showId).add(data.attendeeName);

							// Also collect states
							if (!statesMap.has(data.showId)) {
								statesMap.set(data.showId, new Map());
							}
							statesMap
								.get(data.showId)
								.set(data.attendeeName, data.state || "normal");
						});

						callback(attendeesMap, statesMap);
					}
				);
			}

			// Clear all data
			async clearAllData() {
				try {
					const querySnapshot = await getDocs(
						collection(this.db, this.collections.ATTENDEES)
					);
					const deletePromises = querySnapshot.docs.map((doc) =>
						deleteDoc(doc.ref)
					);
					await Promise.all(deletePromises);
					return true;
				} catch (error) {
					console.error("Error clearing all data:", error);
					return false;
				}
			}

			// Export data as JSON
			async exportData() {
				try {
					const attendeesMap = await this.getAllAttendeesData();
					const data = {};
					attendeesMap.forEach((attendeeSet, showId) => {
						data[showId] = Array.from(attendeeSet);
					});
					return JSON.stringify(data, null, 2);
				} catch (error) {
					console.error("Error exporting data:", error);
					return "{}";
				}
			}

			// Import data from JSON
			async importData(jsonData) {
				try {
					const data = JSON.parse(jsonData);
					const promises = [];

					// Clear existing data first
					await this.clearAllData();

					// Add new data
					Object.entries(data).forEach(([showId, attendeeArray]) => {
						attendeeArray.forEach((attendeeName) => {
							promises.push(this.saveAttendee(showId, attendeeName));
						});
					});

					await Promise.all(promises);
					return true;
				} catch (error) {
					console.error("Error importing data:", error);
					return false;
				}
			}
		};
	} catch (error) {
		console.warn("Firebase not available:", error.message);
		return null;
	}
}

// Initialize Firebase and export the service
initializeFirebase()
	.then((serviceClass) => {
		window.FirebaseService = serviceClass;
	})
	.catch((error) => {
		console.warn("Failed to initialize Firebase:", error);
		window.FirebaseService = null;
	});
