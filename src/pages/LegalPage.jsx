import React, { useEffect } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../components/Typography';
import SiteFooter from '../components/SiteFooter';

const EMAIL = 'aksharconnect369@gmail.com';

const PRIVACY = {
  title: 'Privacy Policy',
  intro: [
    'Effective date: 20 September 2026',
    '**This Privacy Policy** applies to the **Akshar Connect** app for Android devices and web browsers (available at https://aksharmandal.in/aksharconnect/), together with any related services (collectively, the "Application"). The Application is operated by **Akshar Mandal** (the "Service Provider", "we", "us").',
    '**Akshar Connect is a private community-management tool** for members of Akshar Satsang Mandal. It is used to maintain the member directory, record weekly Sabha (assembly) attendance, organise events and volunteer service (seva), and share community content. It is not a public social network: only members who have been added by an authorised Mandal administrator can sign in.',
    '## 1. Information we collect\nWe collect only the information needed to run the community\'s activities.\n\nBecause the Application serves a religious community, your membership may by itself indicate your religious affiliation. We treat all member data as confidential and use it only for the community purposes described here.\n\nSome of this information is entered by you, and some is entered or updated on your behalf by authorised Mandal administrators and volunteers.',
    '## 2. Device permissions\n• Camera – used only when you choose to scan an attendance QR code or take a profile photo. Images are not captured or stored otherwise.\n• Photos / files – used only when you choose to upload a profile photo or a document.\n\nYou can revoke any permission at any time from your device settings.',
    '## 3. How we use your information\nWe use your information to operate the Application: to sign you in, maintain the member directory, record attendance, run events, coordinate volunteer follow-up, produce internal reports for Mandal leadership, send you service messages (such as one-time passcodes and your attendance QR code), keep the Application secure, and comply with the law.\n\n**We do not sell your personal data**, we do not use it for advertising, and the Application contains no third-party advertising.',
    '## 4. Who can see your information\nAccess inside the Application is role-based. Ordinary members see their own profile and activity. Volunteers and leaders (for example Sabha or Mandal heads) can see the information of members within the area they are responsible for, to the extent their role requires. System administrators can access data as needed to operate and support the Application.',
    '## 5. Service providers and disclosure\nWe share personal data only with service providers that help us run the Application, and only to the extent needed for that service:\n\n• **Hosting** – the Application and its database run on servers we rent from a hosting provider.\n• **Cloudflare** – content delivery, protection against attacks and privacy-friendly aggregate web analytics. Cloudflare processes your IP address and request details.\n• **WhatsApp Business Platform (Meta) and Infobip** – delivering one-time passcodes, your attendance QR code and service notices to your WhatsApp number. Your phone number and the message content are processed for delivery.\n• **Google (Gemini API)** – only if you use the resume-assistance feature, the resume details you submit are sent to Google to generate the result.\n• **Google Fonts** – the web app loads fonts from Google, which receives your IP address when it does so.\n• **India Post pincode lookup** – a pincode (without your identity) is sent to validate an address.\n\nWe may also disclose information where required by law or legal process, or where we believe in good faith that it is necessary to protect the rights or safety of our members, the public or the Service Provider.\n\nSome of these providers may process data on servers outside India. Where they do, we rely on their contractual and legal safeguards and transfer only what is needed for the service.',
    '## 6. Cookies and local storage\nThe Application uses a secure cookie and your browser\'s local storage solely to keep you signed in and to make the app work offline. We do not use advertising or cross-site tracking cookies.',
    '## 7. Security\nAll traffic between your device and the Application is encrypted in transit (HTTPS/TLS). Passwords and PINs are stored as one-way hashes, access is restricted by role, and the servers are protected by firewalls and access controls. No method of transmission or storage is completely secure, but we work to protect your information and will notify you and the relevant authorities of a personal-data breach where the law requires it.',
    '## 8. Data retention\n• **Account and profile data** – kept while you remain a member of the Mandal and deleted or anonymised within 30 days of a verified deletion request, unless the law requires longer retention.\n• **Attendance and activity records** – kept while your account exists; after deletion they are removed or retained only in anonymised, aggregate form (for example, total attendance counts).\n• **Technical logs** – kept for up to 24 months.\n• **Backups** – deleted data may persist in encrypted backups for up to 90 days until those backups are rotated out.',
    '## 9. Your rights and deleting your data\nYou may view and correct most of your information from your Profile in the Application. You may also ask us to access, correct or delete your personal data, to withdraw your consent, or to nominate another person to exercise your rights, as provided under applicable law including India\'s Digital Personal Data Protection Act, 2023.\n\nTo delete your account and associated data, follow the steps on our account deletion page or email **aksharconnect369@gmail.com**. Uninstalling the app stops further collection from your device but does not by itself delete data already held by us.',
    '## 10. Children\nThe Mandal\'s activities include children\'s and youth assemblies, so the Application may hold records of members under 18. A child\'s record is created only by, or with the consent of, the child\'s parent or legal guardian, or by an authorised Mandal administrator acting with that consent. Children who do not have their own mobile number are managed under their parent\'s or guardian\'s account, and the parent or guardian controls that profile.\n\nWe do not show advertising to children, do not profile them for commercial purposes and do not knowingly collect a child\'s data without parental consent. A parent or guardian may review, correct or delete their child\'s information at any time by contacting us. If you believe a child\'s information has been provided without consent, please contact us and we will remove it.',
    '## 11. Changes to this policy\nWe may update this Privacy Policy from time to time. The updated version will be posted on this page with a new effective date, and material changes will be announced in the Application. Previous versions are available on request.',
    `## 12. Contact and grievances\nFor any question, request or complaint about privacy or your personal data, contact:\n\nAkshar Mandal – Akshar Connect Privacy / Grievance Contact\nEmail: ${EMAIL}\n\nWe aim to respond within 30 days.`,
  ],
};

const TERMS = {
  title: 'Terms & Conditions',
  intro: [
    'Effective date: 20 September 2026',
    'These Terms and Conditions ("Terms") apply to the **Akshar Connect** app for Android devices and web browsers, together with any related services (collectively, the "Application"), operated by **Akshar Mandal** (the "Service Provider").',
    '**By downloading, signing in to or using the Application, you agree to these Terms.** Please read them carefully. If you do not agree, do not use the Application.',
    '## 1. Who may use the Application\nThe Application is a private tool for members and volunteers of Akshar Satsang Mandal. Accounts are created by authorised Mandal administrators; there is no public sign-up. You must be legally permitted to use the Application in your jurisdiction.\n\nIf you are under 18, you may use the Application only with the consent and under the supervision of your parent or legal guardian, who accepts these Terms on your behalf. Profiles for children who do not have their own mobile number are managed by their parent or guardian.',
    `## 2. Your account\nYou are responsible for keeping your password, PIN and one-time passcodes confidential and for activity that takes place under your account. Your attendance QR code is personal to you and must not be shared. Tell us promptly at ${EMAIL} if you believe your account has been accessed without permission. You agree to keep the information in your profile accurate.`,
    '## 3. Licence to use the Application\nSubject to these Terms, the Service Provider grants you a limited, non-exclusive, non-transferable, revocable licence to install and use the Application for your personal, non-commercial participation in the Mandal\'s activities. You may not copy, distribute, modify, create derivative works from, reverse engineer, decompile or disassemble the Application, except to the extent expressly permitted by applicable law.',
    '## 4. Intellectual property\nThe Service Provider retains all intellectual property rights in the Application, including its code, design, trademarks, logos and branding, and in the community content it publishes through the Application. Nothing in these Terms grants you a right to use those marks or that content outside the Application. You agree not to remove or obscure any copyright or proprietary notice.\n\nSome content in the Application (such as discourses, texts and videos) is made available for viewing by members only. You must not download, copy, record, screenshot for redistribution, or share that content outside the Application.',
    '## 5. Confidentiality of member information\nDepending on your role, the Application may show you personal information about other members (for example names, contact details and attendance). You may use that information **only** for the Mandal\'s activities. You must not export, publish, sell or share it with anyone outside the Mandal, or use it for commercial, political or promotional purposes.',
    '## 6. Acceptable use and content you submit\nWhere the Application lets you submit content (such as a profile photo, job posts, resume details, event responses or follow-up notes), you agree not to submit content that:\n\n• is illegal or infringes anyone\'s intellectual property or privacy rights;\n• is abusive, threatening, harassing, defamatory, hateful or discriminatory;\n• is sexually explicit or gratuitously violent;\n• is spam, phishing or contains malware;\n• is false, misleading or impersonates another person.\n\nYou also agree not to attempt to gain unauthorised access to the Application or other members\' accounts, interfere with its operation, or mark attendance falsely or on behalf of someone else without authority.\n\nThe Service Provider may review, hide or remove content that breaches these Terms and may suspend the accounts of users who breach them. To report content or behaviour, email ${EMAIL} with enough detail for us to identify it. If you are affected by a moderation decision, you may ask us to review it at the same address.\n\nYou keep ownership of content you submit. You grant the Service Provider a non-exclusive, royalty-free licence to store, display and use it within the Application for the Mandal\'s activities. Personal data in your content is handled under our Privacy Policy. Do not submit other people\'s personal data without their consent.',
    '## 7. Fees\nThe Application is currently provided free of charge and does not contain in-app purchases. If that ever changes, any charges will be clearly communicated to you before they apply.',
    '## 8. Your device and connection\nSome functions need an active internet connection. Your mobile or internet provider\'s charges (including roaming) still apply and are your responsibility. You are responsible for keeping your device secure; we advise against rooting or jailbreaking it, which can expose it to malware and may prevent the Application from working correctly.',
    '## 9. Updates and availability\nWe may update the Application from time to time and may change its system requirements. You may need to install updates to keep using it. We do not guarantee that the Application will always be available, error-free or compatible with every device, and we may modify or discontinue it at any time.',
    '## 10. Suspension and termination\nWe may suspend or end your access if you materially breach these Terms, if you cease to be a member of the Mandal, or immediately and without notice if you break the law, infringe others\' rights or act in a way that could harm other members or the Service Provider. You may stop using the Application at any time and may request deletion of your account as described on our account deletion page. On termination, your licence to use the Application ends.',
    '## 11. Disclaimer and limitation of liability\nThe Application is provided "as is" for community purposes. To the fullest extent permitted by law, the Service Provider is not liable for indirect, incidental, special, consequential or punitive damages, or for loss of data or profits, arising from your use of the Application, or for inaccuracies in information supplied by other users or third parties.\n\nTo the fullest extent permitted by law, the Service Provider\'s total liability for any claim is limited to the amount you paid for the Application in the 12 months before the claim or, where the Application is free, to the minimum amount permitted by law. Nothing in these Terms excludes liability for death or personal injury caused by negligence, for fraud, or for any liability that cannot lawfully be excluded, and nothing limits rights you have under consumer-protection laws that cannot be waived.',
    '## 12. Indemnity\nTo the extent permitted by law, you agree to indemnify the Service Provider and its volunteers and office-bearers against claims and reasonable costs arising from your breach of these Terms or your intentional misuse of the Application. This does not apply to claims caused by the Service Provider\'s own negligence or breach.',
    '## 13. Governing law\nThese Terms are governed by the laws of India. Any dispute arising from them will be subject to the jurisdiction of the competent courts in India, without limiting any rights you have under mandatory law to bring a claim elsewhere.',
    '## 14. General\nIf any provision of these Terms is held invalid or unenforceable, it will be modified to the minimum extent necessary and the remaining provisions will stay in force. These Terms, together with the Privacy Policy, are the entire agreement between you and the Service Provider about the Application.',
    '## 15. Changes to these Terms\nWe may update these Terms from time to time. The updated version will be posted on this page with a new effective date; please review it regularly. Continued use of the Application after a change means you accept the updated Terms. Previous versions are available on request.',
    `## 16. Contact us\nQuestions or suggestions about these Terms: ${EMAIL}.`,
  ],
};

const DELETE_ACCOUNT = {
  title: 'Delete Account',
  intro: [
    'This page explains how to request deletion of your Akshar Connect account (app by Akshar Mandal) and the data associated with it.',
    '## How to request deletion\n1. Send an email to **aksharconnect369@gmail.com** with the subject **"Delete my Akshar Connect account"**.\n2. Include your **full name** and the **mobile number registered** in the app. For a child\'s profile, the request must come from the parent or guardian who manages it.\n3. We will verify that the request comes from the account holder (normally by contacting the registered mobile number) and confirm once the deletion is complete.\n\n**Verified requests are completed within 30 days.**',
    '## What is deleted\n• **Your account and sign-in credentials**\n• **Your profile**: name, contact numbers, email, date of birth, address and location, photo, education and occupation details and other personal details\n• **Content you uploaded**, such as resume details and job posts\n• **Follow-up notes and event registrations linked to you**',
    '## What may be kept\n• Anonymised attendance and activity statistics (for example total Sabha attendance counts) that can no longer be linked to you.\n• Security and audit logs for up to 24 months, where needed to protect the service or comply with the law.\n• Encrypted backups, in which deleted data may persist for up to 90 days until the backups are rotated out.',
    `## Delete only some of your data\nYou can edit or remove most optional details yourself from your Profile in the app. To have specific data removed without deleting your whole account, email us at ${EMAIL} and tell us what you would like deleted.`,
  ],
};

function renderParagraph(text, index) {
  const lines = text.split('\n');
  const renderInline = value =>
    value.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
      const bold = part.startsWith('**') && part.endsWith('**');
      return (
        <Text
          key={`${part}-${partIndex}`}
          style={bold ? styles.bold : undefined}
        >
          {bold ? part.slice(2, -2) : part}
        </Text>
      );
    });

  return (
    <View key={`${text.slice(0, 20)}-${index}`} style={styles.block}>
      {lines.map((line, lineIndex) => {
        const heading = line.startsWith('## ');
        return (
          <Text
            key={`${line}-${lineIndex}`}
            style={heading ? styles.heading : styles.paragraph}
          >
            {heading ? line.slice(3) : renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

export default function LegalPage({
  type,
  onBack,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const content = type === 'privacy' ? PRIVACY : type === 'terms' ? TERMS : DELETE_ACCOUNT;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{content.title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>{content.title}</Text>
        {content.intro.map(renderParagraph)}
        {type === 'delete' ? (
          <Pressable
            onPress={() =>
              Linking.openURL(
                `mailto:${EMAIL}?subject=Delete%20my%20Akshar%20Connect%20account`,
              )
            }
            style={styles.emailButton}
            accessibilityRole="button"
            accessibilityLabel="Email a deletion request"
          >
            <MaterialCommunityIcons name="email-outline" size={20} color="#FFFFFF" />
            <Text style={styles.emailButtonText}>Email a deletion request</Text>
          </Pressable>
        ) : null}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F4F8' },
  header: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#003158' },
  back: { padding: 10, marginRight: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  content: { flexGrow: 1, padding: 18, paddingBottom: 0 },
  footerBleed: { marginTop: 'auto', marginHorizontal: -18, paddingTop: 14 },
  pageTitle: { color: '#003158', fontSize: 28, fontWeight: '800', marginBottom: 10 },
  block: { marginBottom: 18 },
  heading: { color: '#003158', fontSize: 18, fontWeight: '800', marginTop: 10, marginBottom: 8 },
  paragraph: { color: '#16324B', fontSize: 14, lineHeight: 22, marginBottom: 7 },
  bold: { fontWeight: '800' },
  emailButton: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#003158', marginBottom: 18 },
  emailButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
