// The live Investment Mayhem server. Press "Play online" and you are on it.
//
// A Firebase web apiKey is not a secret — it only identifies the project, and
// every Google sample ships it in client code. What actually protects the data
// is database.rules.json, which is published on this project: players can only
// write their own save, usernames are claim-once, and the leaderboard, feed and
// chat are append-only and shape-validated.
//
// Hosting your own world instead? Replace this object, or paste yours into the
// in-game Server settings box, then share the join link it generates.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyClOJRHMKGUmYYMHMi4LWJhixOdun0KTg4",
  authDomain: "investment-mayhem.firebaseapp.com",
  databaseURL: "https://investment-mayhem-default-rtdb.firebaseio.com",
  projectId: "investment-mayhem",
  storageBucket: "investment-mayhem.firebasestorage.app",
  messagingSenderId: "1039865701897",
  appId: "1:1039865701897:web:1de7895d455b662e3afad8"
};
