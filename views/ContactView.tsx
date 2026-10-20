import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SUPPORT_EMAIL, APP_VERSION, FEEDBACK_CATEGORIES, feedbackCategory, buildSupportDraft, type FeedbackCategory } from '../lib/support.ts';
import { trackEvent } from '../lib/analytics.ts';

export default function ContactView() {
  const [search] = useSearchParams();
  const [category, setCategory] = useState<FeedbackCategory>(() => feedbackCategory(search.get('category')));
  const [message, setMessage] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [diagnostics, setDiagnostics] = useState(true);
  const [draft, setDraft] = useState<ReturnType<typeof buildSupportDraft> | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => { trackEvent('feedback_opened'); }, []);
  useEffect(() => { setDraft(null); setCopyStatus(''); }, [category, message, replyEmail, diagnostics]);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopyStatus('Copied. Paste it into your email application.'); }
    catch { setCopyStatus('Copy is unavailable. You can select the email address or the message below and copy it manually.'); }
  }
  return <div className="contact-page site-container">
    <div className="page-heading"><h1>Help when you need it.</h1><p>Something not playing, a subtitle out of place, or an idea? Tell us.</p></div>
    <div className="contact-layout">
      <aside className="contact-details"><h2>Write to the maintainer</h2><a className="contact-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><button type="button" className="text-link" onClick={() => copy(SUPPORT_EMAIL)}>Copy email address <span className="material-symbols-outlined" aria-hidden="true">content_copy</span></button><p>This is an email support channel, not live chat. Replies are handled by the individual maintaining EchoListen; there is no guaranteed response time.</p><p>For a quick answer, check the <Link to="/help">listening guide</Link>. Your audio and vocabulary stay in your browser.</p><p>Do not include API keys, private recordings or sensitive transcript text in your report.</p><Link to="/privacy" className="text-link">How feedback data is handled <span aria-hidden="true">→</span></Link></aside>
      <div className="feedback-form-area"><form className="feedback-form" onSubmit={event => { event.preventDefault(); setDraft(buildSupportDraft({category,message,replyEmail,includeDiagnostics:diagnostics,userAgent:navigator.userAgent})); }}>
        <label htmlFor="feedback-category">What can we help with?</label><select id="feedback-category" value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}>{Object.entries(FEEDBACK_CATEGORIES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="feedback-message">What happened?</label><textarea id="feedback-message" required minLength={10} maxLength={2000} rows={6} placeholder="What were you trying to do? What happened instead? Include the steps if you can." value={message} onChange={event => setMessage(event.target.value)} /><p className="field-hint">Your description stays on this page until you choose to send an email.</p>
        <label htmlFor="feedback-reply">Reply email <span>(optional)</span></label><input id="feedback-reply" type="email" autoComplete="email" maxLength={254} placeholder="Where should we reply?" value={replyEmail} onChange={event => setReplyEmail(event.target.value)} />
        <label className="feedback-checkbox"><input type="checkbox" checked={diagnostics} onChange={event => setDiagnostics(event.target.checked)} /><span>Include app version ({APP_VERSION}) and browser family. No audio, file names, transcripts or keys are attached.</span></label>
        <button className="button" type="submit">Prepare email <span aria-hidden="true">↗</span></button><p className="field-hint">This prepares a draft. It is not sent from the website; you send it from your own email application.</p>
      </form>
      {draft && <section className="email-draft" aria-labelledby="draft-heading"><h2 id="draft-heading">Your draft is ready — not sent</h2><p>Review the text, then open your email application. If no application opens, copy the text into Gmail or another service and send it to {SUPPORT_EMAIL}.</p><pre tabIndex={0}>{`To: ${SUPPORT_EMAIL}\nSubject: ${draft.subject}\n\n${draft.body}`}</pre><div className="draft-actions"><a className="button" href={draft.mailto}>Open email draft <span aria-hidden="true">↗</span></a><button type="button" className="button button-secondary" onClick={() => copy(`To: ${SUPPORT_EMAIL}\nSubject: ${draft.subject}\n\n${draft.body}`)}>Copy draft text</button></div></section>}
      {copyStatus && <p role="status" className="copy-status">{copyStatus}</p>}
      </div>
    </div>
  </div>;
}
