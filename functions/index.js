const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const admin = require("firebase-admin");

admin.initializeApp();

exports.budgetKillswitch = onMessagePublished("budget-alerts", async (event) => {
  try {
    const data = JSON.parse(
      Buffer.from(event.data.message.data, "base64").toString()
    );

    const costAmount = data.costAmount || 0;
    const budgetAmount = data.budgetAmount || 5;
    const percentage = (costAmount / budgetAmount) * 100;

    console.log(`Budget used: ${percentage.toFixed(1)}% ($${costAmount} of $${budgetAmount})`);

    if (percentage >= 50) {
      console.log("50% budget threshold hit — activating killswitch...");

      // Log the killswitch event to Firestore
      await admin.firestore().collection("_system").doc("killswitch").set({
        triggered: true,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
        costAmount,
        budgetAmount,
        percentage,
      });

      // Update Firestore security rules to block all access
      const { GoogleAuth } = require("google-auth-library");
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });

      const client = await auth.getClient();
      const projectId = await auth.getProjectId();

      const killRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

      // Call Firebase Rules API to update rules
      const url = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
      const rulesResponse = await client.request({
        url,
        method: "POST",
        data: {
          source: {
            files: [{ name: "firestore.rules", content: killRules }],
          },
        },
      });

      const rulesetName = rulesResponse.data.name;
      console.log("New ruleset created:", rulesetName);

      // Release the new ruleset to the default Firestore database
      const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
      await client.request({
        url: releaseUrl,
        method: "PATCH",
        data: {
          release: {
            name: `projects/${projectId}/releases/cloud.firestore`,
            rulesetName,
          },
        },
      });

      console.log("Killswitch activated — all Firestore access blocked.");
    } else {
      console.log("Budget below 50%, no action taken.");
    }
  } catch (err) {
    console.error("Killswitch function error:", err);
  }
});