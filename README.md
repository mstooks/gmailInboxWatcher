
# Gmail Inbox Watcher and Push Notification Service

This AWS Lambda service is designed to watch a Gmail inbox for emails from a specific sender. When an email is received, it processes the content, stores the full notification (subject, plain text body, and HTML body) in Firebase Firestore, and triggers a push notification to subscribed devices via Expo.

## Features

- **Gmail Inbox Monitoring**: The Lambda connects to a Gmail account via IMAP, searches for unread emails from a specific sender, and marks them as read after processing.
- **Push Notification Handling**: The Lambda sends push notifications to iOS and Android devices using Expo’s push notification service. It automatically truncates the notification title and body to comply with platform limits.
- **Firestore Integration**: Full notification details are stored in Firestore for future reference, with metadata such as the timestamp included.
  
## How it Works

1. The Lambda connects to a Gmail account and searches for unread emails matching the specified sender’s email address.
2. When an email is found, it parses the subject and body, storing the full email content in Firebase Firestore.
3. The Lambda truncates the email content (subject and body) to fit within the character limits for iOS and Android notifications.
4. Push notifications are sent to all registered devices with the truncated message, and the full email is stored in Firestore for later retrieval.

## Prerequisites

- **Node.js 18.x+** installed
- **AWS Lambda** and **AWS CLI** configured
- **Firebase Admin SDK** credentials (`firebase-adminsdk.json`) file in your project root
- **Expo Push Notification tokens** stored in Firestore (collection: `pushTokens`)
- **Gmail App Password** to allow the Lambda to access your Gmail inbox via IMAP (see: [Google App Passwords](https://support.google.com/accounts/answer/185833))

## Setup

### Step 1: Install Dependencies

Before deploying the Lambda, ensure you have all necessary dependencies installed. From the project root directory, run the following command:

```bash
npm install imap-simple mailparser firebase-admin node-fetch
```

### Step 2: Configure Firebase Admin SDK

Make sure you have your Firebase Admin SDK credentials JSON file in the project root (`./firebase-adminsdk.json`). This file is required to authenticate with Firebase Firestore.

### Step 3: Configure Gmail IMAP Settings

Replace the following placeholders in the `config` object within the Lambda code:

```javascript
user: 'REPLACE THIS WITH YOUR GMAIL EMAIL', //this will literally just be like whateveryouremailis@gmail.com
password: 'REPLACE THIS WITH YOUR GMAIL APP PASSWORD',
```

You can create an App Password for your Gmail account by following these instructions: [Google App Passwords](https://support.google.com/accounts/answer/185833).

### Step 4: Set Up Firestore Collections

Ensure you have the following collections set up in Firestore:

1. `pushTokens` - This stores push notification tokens for your devices.
2. `fullNotifications` - This stores the full notification content (subject, plain text, HTML body, etc.) after an email is received.

### AWS Lambda Deployment

To deploy this function on AWS Lambda, follow these steps:

1. **Zip the Function**: Package your Lambda function with all dependencies:

    ```bash
    zip -r lambda_function.zip .
    ```

    ```powershell
    Compress-Archive -Path .\* -DestinationPath ../gmailwatcher.zip
    ```

3. **Deploy the Lambda Function**:
    
    Simple way:

    You can just upload it by hand by going to AWS > Lambda > Create Function (name it and select Node.js 18.x) > upload .zip file

    OR

    Use the AWS CLI to create or update the Lambda function:

    ```bash
    aws lambda create-function --function-name GmailWatcher --runtime nodejs18.x --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-role --handler index.handler --zip-file fileb://lambda_function.zip --timeout 30
    ```

    If the function already exists:

    ```bash
    aws lambda update-function-code --function-name GmailWatcher --zip-file fileb://lambda_function.zip
    ```


## Notes

- **Timeout Settings**: Ensure that your Lambda function's timeout is set to a value that allows sufficient time for the email processing and push notification logic.
- **IMAP Connection Timeout**: You can adjust the `authTimeout` and `connTimeout` values in the IMAP configuration if you encounter issues with connection delays.

## To Run a Test

You can go to your target Gmail inbox and mark any received email from the specific sender as unread to simulate a new email arriving. Then on the Lambda under the Test tab, click the test button and the Lambda will detect the unread status and trigger the push notifications as expected.

I suggest adding a CRON trigger to watch the inbox every minute or 10 minutes (depending on how frequently you need to send them out, from my calculations doing it every 30 seconds should still keep you in the free tier of AWS)
