const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs = require('fs');
const { Timestamp } = require('firebase-admin').firestore;

// Firebase Admin Initialization
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(fs.readFileSync('./firebase-adminsdk.json', 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// Notification Limits
const IOS_CHAR_LIMIT = 178; // 178 characters is the limit for iOS notifications
const ANDROID_TITLE_LIMIT = 65; // 65 characters is the limit for Android notification titles

// IMAP Config
const config = {
  imap: {
    user: 'REPLACE THIS WITH YOUR GMAIL EMAIL',
    password: 'REPLACE THIS WITH YOUR GMAIL APP PASSWORD', // You can learn more about App Passwords here (I'd never heard of it): https://support.google.com/accounts/answer/185833?hl=en
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 3000,  // Increase auth timeout to 3 seconds
    connTimeout: 10000, // Increase connection timeout to 10 seconds
  },
};

exports.handler = async (event, context) => {
  return new Promise((resolve, reject) => {
    imaps.connect(config).then((connection) => {
      return connection.openBox('INBOX').then(() => {
        const searchCriteria = ['UNSEEN', ['FROM', 'whoeveryouwant@gmail.com']];  // Place the email address you want to search for here if there is a specific sender you want to filter by
        const fetchOptions = { bodies: ['HEADER', ''], markSeen: true };

        connection.search(searchCriteria, fetchOptions).then(async (messages) => {
          if (!messages.length) {
            console.log('No new emails found.');
            await connection.end();
            return resolve('No new emails');
          }

          console.log('Found', messages.length, 'new emails.');

          for (const item of messages) {
            const all = item.parts.find(part => part.which === '');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: "+id+"\r\n";

            try {
              const parsed = await simpleParser(idHeader+all.body);
              
              const subject = parsed.subject || 'No Subject';
              const plainTextBody = parsed.text || 'No plain text body';
              const htmlBody = parsed.html || 'No HTML body';

              console.log('Parsed subject:', subject);
              console.log('Parsed plain text:', plainTextBody);
              console.log('Parsed HTML:', htmlBody);

              // Firestore timestamp for createdAt
              const timestamp = Timestamp.now();

              // Save full notification to Firestore
              const fullNotification = {
                title: subject,
                plainTextBody,
                htmlBody,
                createdAt: timestamp,
              };

              await db.collection('fullNotifications').doc(`${timestamp.seconds}`).set(fullNotification);

              // Truncate the plain text for notifications
              const truncatedBody = truncateMessageForNotification(plainTextBody);
              const truncatedTitle = truncateTitleForNotification(subject);

              await sendPushNotifications(truncatedTitle, truncatedBody, `${timestamp.seconds}`);
            } catch (error) {
              console.error('Error processing email:', error);
            }
          }

          await connection.end();
          resolve('Emails processed');
        }).catch(err => {
          console.error('Error searching emails:', err);
          connection.end();
          reject(err);
        });
      });
    }).catch(err => {
      console.error('Error connecting to IMAP:', err);
      reject(err);
    });
  });
};

// Truncate Title for Push Notification
function truncateTitleForNotification(title) {
  if (title.length > ANDROID_TITLE_LIMIT) {
    return title.substring(0, ANDROID_TITLE_LIMIT) + '...';
  }
  return title;
}

// Truncate Message for Push Notification (only plaintext)
function truncateMessageForNotification(message) {
  if (message.length > IOS_CHAR_LIMIT) {
    return message.substring(0, IOS_CHAR_LIMIT) + '...';
  }
  return message;
}

// Send Push Notifications
async function sendPushNotifications(title, message, notificationId) {
  try {
    const tokensSnapshot = await db.collection('pushTokens').get();
    console.log('Push tokens retrieved:', tokensSnapshot.size);

    if (tokensSnapshot.empty) {
      console.log('No push tokens available');
      return;
    }

    const pushTokens = tokensSnapshot.docs.map((doc) => doc.data().token);
    const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

    const chunks = [];
    while (pushTokens.length) {
      chunks.push(pushTokens.splice(0, 100));
    }

    for (const chunk of chunks) {
      const messages = chunk.map((token) => ({
        to: token,
        sound: 'default',
        title: title,
        body: message,
        data: { notificationId },
      }));

      await fetch(expoPushUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      }).then((res) => res.json())
        .then((data) => console.log('Push notifications sent:', data))
        .catch((error) => console.error('Error sending push notifications:', error));
    }
  } catch (error) {
    console.error('Error retrieving push tokens or sending notifications:', error);
  }
}