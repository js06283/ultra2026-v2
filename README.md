# Elements Festival Planner

A modern, interactive festival planning application that allows users to track which shows they want to attend at the Elements Festival. The application now uses the **real Elements Festival schedule** loaded from a CSV file.

## Features

- **Real Festival Schedule**: Loads the actual Elements Festival lineup from CSV data
- **Interactive Show Selection**: Click on shows to add/remove yourself from the attendee list
- **Real-time Updates**: See changes instantly across all users (with Firebase)
- **Multi-day Support**: Plan across Friday, Saturday, and Sunday
- **Multiple Stages**: Track shows across Water, Air, and Earth stages
- **Modern UI**: Beautiful, responsive design with smooth animations
- **Data Persistence**: Save your plans locally or in the cloud
- **Export/Import**: Backup and restore your festival plans

## Schedule Data

The application automatically loads the real Elements Festival schedule from `Elements_Festival_Full_Schedule__All_Days_.csv`. This includes:

- **3 Days**: Friday, Saturday, Sunday
- **3 Stages**: Water, Air, Earth
- **Real Artists**: All actual performers from the festival lineup
- **Accurate Times**: Exact show times as scheduled

### CSV Format

The CSV file should have the following structure:

```csv
Day,Time,Stage,Artist
Friday,3:00PM,Water,Ace on Earth
Friday,3:30PM,Water,Mes
...
```

## Firebase Integration

This application supports Firebase Firestore for real-time data synchronization across multiple users. The app will automatically fall back to localStorage if Firebase is not configured.

### Setting up Firebase

1. **Create a Firebase Project**:

   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard
   - Give your project a name (e.g., "festival-planner")

2. **Enable Firestore Database**:

   - In your Firebase project, go to "Firestore Database"
   - Click "Create database"
   - Choose "Start in test mode" for development (you can secure it later)
   - Select a location close to your users

3. **Get Your Configuration**:

   - In your Firebase project, go to "Project settings" (gear icon)
   - Scroll down to "Your apps" section
   - Click "Add app" and select "Web" (</>)
   - Register your app with a nickname
   - Copy the configuration object

4. **Update the Configuration**:

   - Open `firebase-config.js`
   - Replace the `firebaseConfig` object with your actual configuration:

```javascript
const firebaseConfig = {
	apiKey: "your-actual-api-key",
	authDomain: "your-project-id.firebaseapp.com",
	projectId: "your-project-id",
	storageBucket: "your-project-id.appspot.com",
	messagingSenderId: "your-messaging-sender-id",
	appId: "your-app-id",
};
```

5. **Set up Security Rules** (Optional but Recommended):

   - In Firestore Database, go to "Rules" tab
   - Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendees/{document} {
      allow read, write: if true; // Allow all access for now
    }
  }
}
```

### Database Structure

The Firebase database uses the following structure:

```
attendees/
  ├── show_1_water_ace-on-earth_300pm
  │   ├── showId: "show_1_water_ace-on-earth_300pm"
  │   ├── attendeeName: "JohnDoe"
  │   └── timestamp: "2024-01-01T12:00:00.000Z"
  ├── show_1_air_la-virgen_300pm
  │   ├── showId: "show_1_air_la-virgen_300pm"
  │   ├── attendeeName: "JaneSmith"
  │   └── timestamp: "2024-01-01T12:00:00.000Z"
  └── ...
```

## Usage

1. **Enter Your Name**: Type your name in the input field and click "Add Name"
2. **Select Shows**: Click on any show to add yourself to the attendee list
3. **Remove Yourself**: Click on a show again or click the "×" next to your name to remove yourself
4. **Real-time Updates**: If using Firebase, see changes from other users in real-time
5. **Export Data**: Use Ctrl/Cmd + E to export your festival plan as JSON
6. **Save Data**: Use Ctrl/Cmd + S to manually save your data

## Local Development

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd festival_planner
   ```

2. **Set up Firebase** (optional):

   - Follow the Firebase setup instructions above
   - Update the configuration in `firebase-config.js`

3. **Run locally**:

   - Open `index.html` in your browser
   - Or use a local server:

     ```bash
     # Using Python
     python -m http.server 8000

     # Using Node.js
     npx serve .
     ```

4. **Access the application**:

   - If using a local server: `http://localhost:8000`
   - If opening directly: `file:///path/to/index.html`

## Railway Deployment with Database

For Railway + PostgreSQL deployment instructions, see:

- `RAILWAY_SETUP.md`

## File Structure

```
festival_planner/
├── index.html                                    # Main HTML structure
├── styles.css                                    # Modern CSS styling
├── script.js                                     # Interactive JavaScript functionality
├── firebase-config.js                           # Firebase configuration and service
├── csv-parser.js                                # CSV parsing utility
├── load-schedule.js                             # Schedule loading functionality
├── Elements_Festival_Full_Schedule__All_Days_.csv # Real festival schedule
├── test-firebase.html                           # Firebase configuration test
├── test-csv.html                                # CSV parsing test
├── setup-firebase.md                            # Firebase setup guide
└── README.md                                    # This file
```

## Features in Detail

### Real-time Synchronization

- When Firebase is configured, all changes are synchronized in real-time
- Multiple users can see each other's selections instantly
- Offline support with automatic sync when connection is restored

### Data Management

- **Export**: Download your festival plan as a JSON file
- **Import**: Upload a previously exported JSON file to restore your plan
- **Clear All**: Remove all attendee data (use with caution)

### User Experience

- **Smooth Animations**: Beautiful transitions and hover effects
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Keyboard Shortcuts**: Quick access to common functions
- **Notifications**: Helpful feedback for user actions
- **Loading States**: Smooth loading experience when schedule is being loaded

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

If you encounter any issues or have questions:

1. Check the browser console for error messages
2. Ensure Firebase is properly configured (if using cloud features)
3. Verify your internet connection (for real-time features)
4. Try clearing your browser's local storage if data seems corrupted
5. Check that the CSV file is accessible and properly formatted

## Future Enhancements

- [ ] User authentication and profiles
- [ ] Show recommendations based on preferences
- [ ] Schedule conflicts detection
- [ ] Social features (sharing plans with friends)
- [ ] Mobile app version
- [ ] Advanced filtering and search
- [ ] Integration with festival APIs
- [ ] Custom schedule import/export
- [ ] Artist information and bios
- [ ] Stage maps and locations
