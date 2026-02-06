# Alert Notification Configuration

KubeStellar Console supports sending alert notifications through multiple channels including Slack and Email. This guide explains how to configure these notification channels.

## Table of Contents

- [Overview](#overview)
- [Configuring Slack Notifications](#configuring-slack-notifications)
- [Configuring Email Notifications](#configuring-email-notifications)
- [Setting Up Alert Rules with Notifications](#setting-up-alert-rules-with-notifications)
- [Testing Notifications](#testing-notifications)
- [Troubleshooting](#troubleshooting)

## Overview

The KubeStellar Console alert notification system allows you to:

- Send alerts to **Slack** via webhook integration
- Send alerts via **Email** using SMTP
- Configure multiple notification channels per alert rule
- Route alerts based on severity (critical, warning, info)
- Test notification configurations before deployment

## Configuring Slack Notifications

### Step 1: Create a Slack Webhook

1. Go to your Slack workspace settings
2. Navigate to **Apps** > **Incoming Webhooks**
3. Click **Add New Webhook to Workspace**
4. Select the channel where you want to receive alerts
5. Copy the webhook URL (e.g., `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`)

### Step 2: Configure in KubeStellar Console

1. Navigate to **Settings** > **Alert Notifications**
2. In the **Slack Integration** section:
   - Paste your webhook URL
   - (Optional) Override the default channel with `#alerts` or another channel
3. Click **Test Slack Notification** to verify the configuration

### Slack Message Format

Alerts sent to Slack include:
- Alert severity (with color coding)
- Alert rule name
- Alert message
- Cluster, namespace, and resource information
- Timestamp

Example Slack message:
```
🚨 Critical Alert

GPU Usage Critical
GPU usage is 95.2% (38/40 GPUs allocated)

Severity: critical
Status: firing
Cluster: prod-cluster
Threshold: 90%
```

## Configuring Email Notifications

### Step 1: Gather SMTP Information

You'll need:
- SMTP host (e.g., `smtp.gmail.com` for Gmail)
- SMTP port (usually `587` for TLS or `465` for SSL)
- Email username (for authentication)
- Email password or app-specific password
- From address (sender email)
- To address(es) (comma-separated list of recipients)

### Step 2: Configure in KubeStellar Console

1. Navigate to **Settings** > **Alert Notifications**
2. In the **Email Integration** section:
   - Enter SMTP host and port
   - Enter from address
   - Enter to address(es) (comma-separated for multiple recipients)
   - Enter SMTP username and password
3. Click **Test Email Notification** to verify the configuration

### Email Format

Alert emails are sent as HTML with:
- Color-coded severity headers
- Alert rule name and message
- Detailed alert information (cluster, namespace, resource)
- Timestamp
- Alert ID for tracking

### Common SMTP Configurations

#### Gmail
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
Username: your-email@gmail.com
Password: [App-specific password]
```

**Note:** For Gmail, you must use an [app-specific password](https://support.google.com/accounts/answer/185833).

#### Office 365
```
SMTP Host: smtp.office365.com
SMTP Port: 587
Username: your-email@company.com
Password: [Your password]
```

#### SendGrid
```
SMTP Host: smtp.sendgrid.net
SMTP Port: 587
Username: apikey
Password: [Your SendGrid API key]
```

## Setting Up Alert Rules with Notifications

### Creating an Alert Rule with Notification Channels

1. Navigate to the **Alerts** page
2. Click **Create Alert Rule** or edit an existing rule
3. Configure the alert condition (e.g., GPU usage > 90%)
4. In the **Notification Channels** section:
   - Click **+ Slack** to add a Slack channel
   - Enter the Slack webhook URL (inline configuration)
   - Alternatively, click **+ Email** for email notifications
   - Enter email configuration details
5. Enable/disable channels with the toggle switch
6. Save the alert rule

### Alert Rule Configuration Example

```typescript
{
  name: "High GPU Usage Alert",
  severity: "critical",
  condition: {
    type: "gpu_usage",
    threshold: 90
  },
  channels: [
    {
      type: "slack",
      enabled: true,
      config: {
        slackWebhookUrl: "https://hooks.slack.com/services/...",
        slackChannel: "#alerts"
      }
    },
    {
      type: "email",
      enabled: true,
      config: {
        emailSMTPHost: "smtp.gmail.com",
        emailSMTPPort: 587,
        emailFrom: "alerts@example.com",
        emailTo: "team@example.com,oncall@example.com",
        emailUsername: "alerts@example.com",
        emailPassword: "app-specific-password"
      }
    }
  ]
}
```

## Testing Notifications

### Test from Settings Page

1. Go to **Settings** > **Alert Notifications**
2. Configure a notification channel (Slack or Email)
3. Click the **Test** button for that channel
4. Check your Slack channel or email inbox for the test notification

### Test Alert Rules

When you create or edit an alert rule:
1. Save the alert rule with notification channels configured
2. The alert system will automatically send notifications when conditions are met
3. Use the demo mode or manually trigger conditions to test alerts

## Troubleshooting

### Slack Notifications Not Working

**Problem:** Test notification fails or alerts don't appear in Slack

**Solutions:**
- Verify the webhook URL is correct and hasn't been revoked
- Check that the webhook has permission to post to the selected channel
- Ensure the webhook URL starts with `https://hooks.slack.com/services/`
- Try creating a new webhook in Slack

### Email Notifications Not Working

**Problem:** Test email fails or emails aren't received

**Solutions:**
- **Gmail:** Make sure you're using an app-specific password, not your regular password
- **Port Issues:** Try port 465 if 587 doesn't work
- **Firewall:** Ensure the KubeStellar Console can connect to the SMTP server
- **Authentication:** Verify username and password are correct
- **Spam Filter:** Check spam/junk folders
- **TLS/SSL:** Some SMTP servers require specific TLS/SSL configurations

### Alerts Not Sending Notifications

**Problem:** Alerts are created but notifications aren't sent

**Solutions:**
- Check that the notification channel is **enabled** in the alert rule
- Verify the alert condition is actually being met
- Check browser console for errors
- Review backend logs for notification failures
- Ensure notification configuration is saved in the alert rule

### Common Error Messages

#### "Slack webhook URL not configured"
Configure the Slack webhook URL in the alert rule's notification channel.

#### "SMTP host not configured"
Ensure all required email fields (SMTP host, from, to) are filled in.

#### "Failed to send notification"
Check network connectivity and verify credentials are correct.

## Security Considerations

### Storing Credentials

- Notification configurations are stored **client-side** in localStorage
- For production deployments, consider:
  - Using environment variables for sensitive credentials
  - Implementing server-side credential storage with encryption
  - Using secret management systems (Vault, AWS Secrets Manager, etc.)

### Webhook Security

- Keep Slack webhook URLs secret
- Regenerate webhooks if they're compromised
- Use channel-specific webhooks to limit access

### Email Security

- Use app-specific passwords instead of main account passwords
- Consider using dedicated email accounts for alerts
- Enable 2FA on email accounts

## Best Practices

1. **Test First:** Always test notification channels before relying on them in production
2. **Multiple Channels:** Configure both Slack and Email for critical alerts
3. **Channel Routing:** Use different channels for different severity levels
4. **Alert Fatigue:** Don't over-alert; focus on critical issues
5. **Documentation:** Document your alert rules and notification channels for your team
6. **Regular Review:** Periodically review and update notification configurations

## API Endpoints

The notification system exposes the following API endpoints:

- `POST /api/notifications/test` - Test a notification configuration
- `POST /api/notifications/send` - Send an alert notification
- `GET /api/notifications/config` - Get notification configuration
- `POST /api/notifications/config` - Save notification configuration

## Support

For issues or questions:
- Create an issue in the [KubeStellar Console repository](https://github.com/kubestellar/console/issues)
- Check the [KubeStellar documentation](https://kubestellar.io/)
- Review existing alert configurations and examples in the codebase
