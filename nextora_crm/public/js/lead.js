frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        if (!frm.is_new()) {

            frm.add_custom_button(__('Send Mail'), function() {

                // Collect emails from custom_emails child table
                let recipients = [];
                (frm.doc.custom_emails || []).forEach(row => {
                    if (row.email) recipients.push(row.email);
                });

                if (recipients.length === 0) {
                    frappe.msgprint({
                        title: 'No Recipients',
                        message: 'Please add at least one email in the Emails table.',
                        indicator: 'red'
                    });
                    return;
                }

                // Track attachments array
                let attachment_urls = [];

                // Get logged in user full name
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: {
                        doctype: 'User',
                        filters: { name: frappe.session.user },
                        fieldname: ['full_name', 'email']
                    },
                    callback: function(r) {
                        let user = r.message || {};
                        let sender_name = user.full_name || frappe.session.user;
                        let sender_email = user.email || frappe.session.user;

                        // Open dialog
                        let dialog = new frappe.ui.Dialog({
                            title: '📧 Send Mail',
                            size: 'large',
                            fields: [
                                {
                                    fieldname: 'to_emails',
                                    fieldtype: 'Small Text',
                                    label: 'To (Recipients)',
                                    default: recipients.join(', '),
                                    read_only: 1
                                },
                                {
                                    fieldname: 'subject',
                                    fieldtype: 'Data',
                                    label: 'Subject',
                                    reqd: 1,
                                    default: `New Lead: ${frm.doc.lead_name || frm.doc.name}`
                                },
                                {
                                    fieldname: 'message',
                                    fieldtype: 'Text Editor',
                                    label: 'Message',
                                    reqd: 1,
                                    default: `
                                        <p>Hello,</p>
                                        <p>A new lead has been created.</p>
                                        <br>
                                        <table style="border-collapse: collapse; width: 100%;">
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #ddd; background:#f2f2f2;"><b>Lead Name</b></td>
                                                <td style="padding: 8px; border: 1px solid #ddd;">${frm.doc.lead_name || ''}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #ddd; background:#f2f2f2;"><b>Company</b></td>
                                                <td style="padding: 8px; border: 1px solid #ddd;">${frm.doc.company_name || ''}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #ddd; background:#f2f2f2;"><b>Phone</b></td>
                                                <td style="padding: 8px; border: 1px solid #ddd;">${frm.doc.phone || ''}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #ddd; background:#f2f2f2;"><b>Lead ID</b></td>
                                                <td style="padding: 8px; border: 1px solid #ddd;">${frm.doc.name}</td>
                                            </tr>
                                        </table>
                                        <br>
                                        <p>Regards,<br>
                                        <b>${sender_name}</b><br>
                                        ${sender_email}</p>
                                    `
                                },
                                {
                                    fieldname: 'section_attachments',
                                    fieldtype: 'Section Break',
                                    label: 'Attachments'
                                },
                                {
                                    fieldname: 'attachments',
                                    fieldtype: 'Attach',
                                    label: 'Add Attachment'
                                },
                                {
                                    fieldname: 'attachment_list',
                                    fieldtype: 'HTML',
                                    label: '',
                                    options: `
                                        <div id="dialog-attachment-list" style="margin-top: 8px;">
                                            <p id="no-attachments-msg" style="color:#888; font-size:12px;">
                                                No attachments added yet.
                                            </p>
                                        </div>
                                    `
                                }
                            ],
                            primary_action_label: 'Send',
                            primary_action: function(values) {

                                if (attachment_urls.length === 0 && !values.attachments) {
                                    // No attachments — that's fine, continue
                                }

                                // Add last selected attachment if not yet added
                                if (values.attachments && !attachment_urls.includes(values.attachments)) {
                                    attachment_urls.push(values.attachments);
                                }

                                // Show processing state
                                let send_btn = dialog.get_primary_btn();
                                send_btn.prop('disabled', true);
                                send_btn.html(`
                                    <span class="spinner-border spinner-border-sm" role="status"></span>
                                    &nbsp;Sending...
                                `);

                                frappe.call({
                                    method: 'nextora_crm.nextora_crm.api.send_lead_email',
                                    args: {
                                        lead_name: frm.doc.name,
                                        recipients: JSON.stringify(recipients),
                                        subject: values.subject,
                                        message: values.message,
                                        attachments: JSON.stringify(attachment_urls)
                                    },
                                    callback: function(response) {
                                        send_btn.prop('disabled', false);
                                        send_btn.html('Send');

                                        if (!response.exc) {
                                            dialog.hide();
                                            attachment_urls = []; // reset
                                            frappe.show_alert({
                                                message: '✅ Email sent successfully!',
                                                indicator: 'green'
                                            }, 5);
                                        } else {
                                            frappe.show_alert({
                                                message: '❌ Failed to send email. Check Error Log.',
                                                indicator: 'red'
                                            }, 5);
                                        }
                                    },
                                    error: function() {
                                        send_btn.prop('disabled', false);
                                        send_btn.html('Send');
                                        frappe.show_alert({
                                            message: '❌ Failed to send email. Check Error Log.',
                                            indicator: 'red'
                                        }, 5);
                                    }
                                });
                            }
                        });

                        dialog.show();

                        // Function to render attachment list
                        function render_attachment_list() {
                            let list_div = $('#dialog-attachment-list');
                            list_div.empty();

                            if (attachment_urls.length === 0) {
                                list_div.append(`
                                    <p id="no-attachments-msg" style="color:#888; font-size:12px;">
                                        No attachments added yet.
                                    </p>
                                `);
                                return;
                            }

                            attachment_urls.forEach(function(url, index) {
                                let filename = decodeURIComponent(url.split('/').pop());
                                let ext = filename.split('.').pop().toLowerCase();

                                // Icon based on file type
                                let icon = '📎';
                                if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) icon = '🖼️';
                                else if (['pdf'].includes(ext)) icon = '📄';
                                else if (['doc','docx'].includes(ext)) icon = '📝';
                                else if (['xls','xlsx'].includes(ext)) icon = '📊';
                                else if (['zip','rar'].includes(ext)) icon = '🗜️';

                                list_div.append(`
                                    <div id="attachment-item-${index}"
                                        style="margin: 6px 0; padding: 8px 12px; background: #f4f5f7;
                                               border-radius: 6px; display: flex; align-items: center;
                                               gap: 10px; border: 1px solid #e0e0e0;">
                                        <span style="font-size:18px;">${icon}</span>
                                        <a href="${url}" target="_blank"
                                           style="flex:1; font-size:13px; color:#333;
                                                  text-decoration:none; word-break:break-all;">
                                            ${filename}
                                        </a>
                                        <button onclick="remove_attachment(${index})"
                                            style="background:none; border:none; cursor:pointer;
                                                   color:#e74c3c; font-size:16px; padding:0 4px;"
                                            title="Remove attachment">
                                            ✕
                                        </button>
                                    </div>
                                `);
                            });
                        }

                        // Global remove function
                        window.remove_attachment = function(index) {
                            attachment_urls.splice(index, 1);
                            render_attachment_list();
                        };

                        // Watch for new attachments added
                        dialog.fields_dict.attachments.$input.on('change', function() {
                            setTimeout(function() {
                                let file_url = dialog.get_value('attachments');
                                if (file_url && !attachment_urls.includes(file_url)) {
                                    attachment_urls.push(file_url);
                                    render_attachment_list();
                                    dialog.set_value('attachments', '');
                                }
                            }, 500);
                        });

                        // Also watch after upload completes
                        let orig_onchange = dialog.fields_dict.attachments.df.onchange;
                        dialog.fields_dict.attachments.df.onchange = function() {
                            if (orig_onchange) orig_onchange();
                            setTimeout(function() {
                                let file_url = dialog.get_value('attachments');
                                if (file_url && !attachment_urls.includes(file_url)) {
                                    attachment_urls.push(file_url);
                                    render_attachment_list();
                                    dialog.set_value('attachments', '');
                                }
                            }, 500);
                        };
                    }
                });

            });
        }
    }
});