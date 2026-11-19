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
9. Optional check: open that URL in a browser. You should see **"✓ Work Timer sync is working."** This URL is only for the app to send data to; you never need to open it again.

## Part 3: Install the app on your iPhone

1. On your iPhone, open the app's GitHub Pages URL in **Safari**: `https://<your-github-username>.github.io/<your-repo-name>/`
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**. (iOS saves the dark launch screen when you add the app. If you added it before the launch screen existed, delete the home-screen icon and add it again; your data in the Sheet is unaffected, but sessions not yet synced on the phone would be lost, so check it says ✓ synced first.)
3. Open the app from your home screen.
4. **Long-press** the header **SHIFT//LOG** to open settings.
5. Paste the Web app URL (`https://script.google.com/macros/s/<your-script-id>/exec`) into the sync URL field and save.

Finish a short test session. Within a few seconds a row appears in two tabs: the tab for its category (**Client**, **Personal** or **Employer**) and **Everything**, which collects all sessions. The script creates these tabs the first time it needs them, each with the header `Date, Category, Start, End, Hours, ID`. Don't rename them, or the script will make a fresh tab with the original name. The original "Sheet1" tab is no longer used; you can delete it.

A **Summary** tab (the first tab) shows hours per week (weeks start on Monday) and per month, split by category with a total. It is rebuilt from the **Everything** tab after every sync and each time you open the Sheet, so rows you fix or add by hand in **Everything** are counted too. To refresh it right away, use the **Work Timer › Refresh summary** menu. Don't edit the Summary tab itself; it is overwritten each time. If you are offline, sessions are kept on the phone and sent later.

Once the app has reached your script, a **↗ SHEET** button appears at the top right. Tap it to open your Google Sheet.

## Updating the script later

If `Code.gs` ever changes, do not create a new deployment, because that gives a new URL. Instead:

1. In the Apps Script editor, paste the new code and save.
2. Click **Deploy › Manage deployments**.
3. Click the pencil (edit) icon on your deployment.
4. Under **Version**, choose **New version**, then click **Deploy**.

The URL stays the same, so the app keeps working.

If you see "Script function not found: doGet" when opening the URL, your deployment is running an older copy of the script. Update it with the steps above.

## Updating the script with clasp (optional, from a computer)

Instead of pasting by hand, you can push `apps-script/` straight to Google with [clasp](https://github.com/google/clasp), Google's command-line tool for Apps Script. One-time setup:

1. Turn on **Google Apps Script API** at <https://script.google.com/home/usersettings>.
2. Run `npx @google/clasp@3.4.1 login` and approve the sign-in with the account that owns the Sheet.
3. In `apps-script/`, create `.clasp.json` with `{"scriptId": "<Script ID from Project Settings>", "rootDir": "", "scriptExtensions": [".gs"]}`.
4. Run `npx @google/clasp@3.4.1 list-deployments` there, and save the ID of the numbered (`@N`) deployment, not `@HEAD`, into `apps-script/.deployment-id`.

Both files are git-ignored: the deployment ID is the secret part of your sync URL, so never commit it.

After that, every update is one command, and the sync URL stays the same:

```
npm run deploy:script -- "what changed"
```

To remove clasp's access later, go to your Google Account › Security › Third-party access, and delete `~/.clasprc.json`.
