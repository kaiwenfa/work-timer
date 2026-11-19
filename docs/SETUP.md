# Work Timer setup

You will make a Google Sheet that collects your sessions, then connect the phone app to it. It takes about 10 minutes and costs nothing.

## Part 1: Create the Sheet and the script

1. Go to <https://sheets.google.com> and click **Blank spreadsheet**. Name it "Work Timer" (click "Untitled spreadsheet" at the top left).
2. Check the time zone: click **File › Settings**, find **Time zone**, and make sure it matches the time zone of your phone. Click **Save settings** if you changed it.
3. Click **Extensions › Apps Script**. A new tab opens with a code editor.
4. In the editor, select everything in the file `Code.gs` (Cmd+A) and delete it.
5. Open `apps-script/Code.gs` from this project, copy all of it, and paste it into the editor.
6. Click the **Save** icon (disk) at the top.

## Part 2: Deploy it as a web app

1. Click the blue **Deploy** button at the top right, then **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**. (The URL is a long secret; anyone without it cannot reach your sheet.)
5. Click **Deploy**.
6. Click **Authorize access** and choose your Google account.
7. You will see **"Google hasn't verified this app"**. This is normal: you wrote this script yourself, and Google only checks scripts that are published to others. Click **Advanced**, then **Go to Work Timer (unsafe)** (the project name may differ), then **Allow**.
8. Copy the **Web app URL**. It ends in `/exec`. Keep it private, and save it somewhere you can reach from your phone (for example, send it to yourself in Notes).

## Part 3: Install the app on your iPhone

1. On your iPhone, open the app's GitHub Pages URL in **Safari**: `https://<your-github-username>.github.io/<your-repo-name>/`
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open the app from your home screen.
4. **Long-press** the header **SHIFT//LOG** to open settings.
5. Paste the Web app URL (`https://script.google.com/macros/s/<your-script-id>/exec`) into the sync URL field and save.

Finish a short test session. A row should appear in the first tab of your Sheet within a few seconds, with the header `Date, Category, Start, End, Hours, ID`. If you are offline, sessions are kept on the phone and sent later.

## Updating the script later

If `Code.gs` ever changes, do not create a new deployment, because that gives a new URL. Instead:

1. In the Apps Script editor, paste the new code and save.
2. Click **Deploy › Manage deployments**.
3. Click the pencil (edit) icon on your deployment.
4. Under **Version**, choose **New version**, then click **Deploy**.

The URL stays the same, so the app keeps working.
