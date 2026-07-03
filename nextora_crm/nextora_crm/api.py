import frappe
import json
import os

@frappe.whitelist()
def send_lead_email(lead_name, recipients, subject, message, attachments=None):
    try:
        # Parse recipients
        if isinstance(recipients, str):
            try:
                recipients = json.loads(recipients)
            except Exception:
                recipients = [r.strip() for r in recipients.split(',')]

        # Parse and build attachments
        attachment_list = []
        if attachments:
            if isinstance(attachments, str):
                try:
                    attachment_urls = json.loads(attachments)
                except Exception:
                    attachment_urls = []
            else:
                attachment_urls = attachments

            for url in attachment_urls:
                if not url:
                    continue

                # Get actual file path on disk
                if url.startswith('/private/files/'):
                    file_path = frappe.get_site_path() + url
                elif url.startswith('/files/'):
                    file_path = frappe.get_site_path('public') + url
                else:
                    continue

                if os.path.exists(file_path):
                    filename = os.path.basename(file_path)
                    with open(file_path, 'rb') as f:
                        file_content = f.read()

                    attachment_list.append({
                        "fname": filename,
                        "fcontent": file_content
                    })
                else:
                    frappe.log_error(f"File not found on disk: {file_path}", "Lead Email Attachment Error")

        # Get logged in user details
        sender_user = frappe.get_doc("User", frappe.session.user)
        sender_name = sender_user.full_name or sender_user.username
        sender_email = (sender_user.email or "").strip()

        if not sender_email or "@" not in sender_email:
            frappe.throw(f"Invalid sender email: '{sender_email}'")

        # Find Email Account for logged-in user
        user_email_account = frappe.db.get_value(
            "Email Account",
            {
                "email_id": sender_email,
                "enable_outgoing": 1
            },
            "name"
        )

        if not user_email_account:
            frappe.throw(f"No outgoing Email Account found for {sender_email}. Please configure one.")

        frappe.sendmail(
            recipients=recipients,
            sender=sender_email,
            reply_to=sender_email,
            subject=subject,
            message=message,
            attachments=attachment_list if attachment_list else None,
            now=True
        )

        frappe.log_error(
            f"Email sent to {recipients} from {sender_email} with {len(attachment_list)} attachments",
            "Lead Email Success"
        )

        return {"status": "success"}

    except Exception as e:
        frappe.log_error(str(e), "Lead Email Error")
        frappe.throw(str(e))