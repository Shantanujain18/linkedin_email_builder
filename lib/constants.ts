export const SITE = {
  name: "ReachPod",
  tagline: "We get you in the door.",
  description:
    "AI-powered job outreach that scrapes LinkedIn recruiter posts, writes personalized cold emails, and helps you get noticed at scale.",
  url: "https://reachpod.app"
} as const;

export const NAV_LINKS = [
  { label: "How it Works", href: "/#how-it-works" },
  { label: "Tool vs Service", href: "/#comparison" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/contact" }
] as const;

export const SOCIAL_PROOF = [
  "Google",
  "Microsoft",
  "Amazon",
  "Flipkart",
  "Swiggy",
  "Meta",
  "Stripe",
  "Notion",
  "Atlassian",
  "Uber"
] as const;

export const DIY_STEPS = [
  { icon: "FileUp", title: "Upload your resume", body: "We extract skills, experience, and talking points once." },
  { icon: "Search", title: "We scrape LinkedIn recruiter posts", body: "Fresh hiring posts matched to your profile — automatically." },
  { icon: "Bot", title: "AI drafts personalized emails", body: "Every draft references the recruiter’s actual post + your resume." },
  { icon: "Eye", title: "Review drafts in the dashboard", body: "Edit, approve, or discard before anything goes out." },
  { icon: "Send", title: "Send via your own Gmail/SMTP", body: "You stay in control of delivery and sender reputation." },
  { icon: "Inbox", title: "Replies come straight to your inbox", body: "Then you take the conversation forward yourself." }
] as const;

export const DFY_STEPS = [
  { icon: "FileUp", title: "Upload resume + target role", body: "Tell us the roles and companies you want to reach." },
  { icon: "Search", title: "We scrape LinkedIn for you", body: "Our team + AI finds relevant recruiter posts continuously." },
  { icon: "Bot", title: "AI drafts all emails", body: "Hyper-personalized outreach written at scale." },
  { icon: "Send", title: "We send on your behalf", body: "Emails go out via your SMTP so they look like you." },
  { icon: "Inbox", title: "Replies land in YOUR inbox", body: "Recruiters reply to you — not to us." },
  { icon: "Handshake", title: "You take the conversation forward", body: "We get you in the door. You close the deal." }
] as const;

export const COMPARISON_ROWS = [
  { feature: "LinkedIn Scraping", free: "50/mo", pro: "Unlimited", service: "Unlimited" },
  { feature: "AI Email Drafting", free: true, pro: true, service: true },
  { feature: "Draft Review", free: true, pro: true, service: true },
  { feature: "SMTP Send (Self)", free: true, pro: true, service: false },
  { feature: "We Send For You", free: false, pro: false, service: true },
  { feature: "Account Manager", free: false, pro: false, service: true },
  { feature: "Weekly Reports", free: false, pro: false, service: true },
  { feature: "Reply Handling", free: "You", pro: "You", service: "You" }
] as const;

export const FEATURES = [
  {
    title: "Auto LinkedIn Scraping",
    body: "No manual CSV uploads. We scrape recruiter posts automatically on your behalf.",
    icon: "Radar",
    span: "md:col-span-2"
  },
  {
    title: "AI Personalization",
    body: "Every email references the recruiter’s actual LinkedIn post. Not a generic template.",
    icon: "Sparkles",
    span: "md:col-span-1"
  },
  {
    title: "Bulk SMTP Send",
    body: "Connect your Gmail. Send hundreds of emails without leaving ReachPod.",
    icon: "Mails",
    span: "md:col-span-1"
  },
  {
    title: "Draft Review Dashboard",
    body: "See every email before it goes out. Edit, approve, or discard.",
    icon: "LayoutDashboard",
    span: "md:col-span-1"
  },
  {
    title: "Done-For-You Mode",
    body: "Too busy? Let our team handle scraping, drafting, and sending. You just reply.",
    icon: "Users",
    span: "md:col-span-2"
  },
  {
    title: "Resume Parsing",
    body: "Upload once. We extract your skills, experience, and tailor every email.",
    icon: "FileSearch",
    span: "md:col-span-1"
  },
  {
    title: "Real-time Analytics",
    body: "Track sends, opens, and replies all in one dashboard.",
    icon: "LineChart",
    span: "md:col-span-1"
  },
  {
    title: "Privacy First",
    body: "Your SMTP, your emails, your inbox. We never store your credentials in plaintext.",
    icon: "ShieldCheck",
    span: "md:col-span-1"
  }
] as const;

export const STATS = [
  { value: 5000, suffix: "+", label: "emails sent" },
  { value: 500, suffix: "+", label: "job seekers" },
  { value: 35, suffix: "%", label: "avg reply rate" },
  { value: 4.9, suffix: " ★", label: "rating", decimals: 1 }
] as const;

export const TESTIMONIALS = [
  {
    name: "Aisha Khan",
    role: "Backend Engineer",
    company: "ex-Flipkart",
    quote: "I stopped spraying applications. Within two weeks I had real recruiter threads in my inbox.",
    stars: 5
  },
  {
    name: "Rohan Mehta",
    role: "Product Designer",
    company: "Freelance",
    quote: "The drafts actually referenced the posts. Recruiters could tell it wasn’t a mass template.",
    stars: 5
  },
  {
    name: "Priya Nair",
    role: "Data Analyst",
    company: "Career switch",
    quote: "Free tier was enough to prove it worked. Upgraded to Pro the same week.",
    stars: 5
  },
  {
    name: "Dev Patel",
    role: "Full-stack Dev",
    company: "ex-Swiggy",
    quote: "DFY service filled my pipeline while I focused on interviews. I handled every reply myself.",
    stars: 5
  },
  {
    name: "Sara Joseph",
    role: "ML Engineer",
    company: "Seeking roles",
    quote: "Honest about what they don’t do. That clarity sold me more than any hype.",
    stars: 5
  },
  {
    name: "Arjun Desai",
    role: "SDE-2",
    company: "Bangalore",
    quote: "SMTP through my Gmail meant replies came to me. ReachPod just opened the door.",
    stars: 4
  },
  {
    name: "Neha Gupta",
    role: "Frontend Engineer",
    company: "Remote",
    quote: "Scraping + drafting alone saved me hours every day. Sending was the easy part.",
    stars: 5
  },
  {
    name: "Kabir Singh",
    role: "DevOps",
    company: "Job search",
    quote: "35% reply rate felt unreal until I saw how specific each email was.",
    stars: 5
  }
] as const;

export const PRICING = {
  free: {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    blurb: "Prove the workflow before you pay.",
    cta: "Start Free",
    href: "/signup",
    features: [
      "Scrape 50 LinkedIn posts/month",
      "AI email drafting",
      "Draft review dashboard",
      "Send via your SMTP",
      "Community support"
    ]
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly: 10,
    yearly: 100,
    blurb: "Unlimited scraping and sending for serious seekers.",
    cta: "Contact for Pro",
    href: "/contact",
    popular: true,
    features: [
      "Unlimited LinkedIn scraping",
      "Unlimited AI drafting",
      "Bulk SMTP send",
      "Analytics dashboard",
      "Priority support"
    ]
  },
  service: {
    id: "service",
    name: "Service",
    monthly: null,
    quarterly: 75,
    blurb: "We scrape, draft, and send. You handle replies.",
    cta: "Contact for Service",
    href: "/contact",
    features: [
      "Everything in Pro",
      "We scrape for you",
      "We draft for you",
      "We send on your behalf",
      "Dedicated account manager",
      "Weekly sending reports",
      "Replies handled by YOU"
    ]
  }
} as const;

export const FAQS = [
  {
    q: "Do I need to scrape LinkedIn myself?",
    a: "No. ReachPod scrapes LinkedIn recruiter posts automatically. Free tier gets 50 scrapes/month; Pro and Service get unlimited."
  },
  {
    q: "How personalized are the emails?",
    a: "Each email is written by AI referencing the recruiter’s specific LinkedIn post and your resume. Not a template — a tailored pitch."
  },
  {
    q: "What exactly does the Done-For-You service include?",
    a: "We scrape LinkedIn, draft all emails using AI, and send them via your SMTP on your behalf. That’s it. Replies land in your inbox and you take it from there."
  },
  {
    q: "Do you handle replies or follow-ups?",
    a: "No. Once a recruiter replies to your email, the conversation is entirely yours. We get you in the door — you close the deal."
  },
  {
    q: "Is my Gmail/SMTP credentials safe?",
    a: "Your credentials are encrypted and used only to send emails. We never share them, and you can revoke access anytime."
  },
  {
    q: "Can I switch between Tool and Service?",
    a: "Yes. Start free anytime. For Pro or Done-For-You Service, contact us at shantanujain18@gmail.com or use the contact form — we’ll set up your plan."
  },
  {
    q: "How do I subscribe to Pro or Service?",
    a: "There is no self-serve checkout yet. Email shantanujain18@gmail.com or submit the contact form on this site. We’ll follow up and activate your plan."
  },
  {
    q: "Is this against LinkedIn’s terms of service?",
    a: "We scrape only publicly visible recruiter posts. Use ReachPod responsibly and within fair usage limits."
  }
] as const;

export const FOOTER_LINKS = {
  product: [
    { label: "How it Works", href: "/#how-it-works" },
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" }
  ],
  company: [
    { label: "Contact", href: "/contact" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "FAQ", href: "/#faq" }
  ]
} as const;
