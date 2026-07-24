import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  serial,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  name: text("name").notNull().default(""),
  yoe: text("yoe").notNull().default(""),
  topSkills: text("top_skills").notNull().default(""),
  currentRole: text("current_role").notNull().default(""),
  resumeLink: text("resume_link").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  resumeText: text("resume_text").notNull().default(""),
  resumeFilename: text("resume_filename").notNull().default(""),
  resumeMime: text("resume_mime").notNull().default(""),
  resumePath: text("resume_path").notNull().default(""),
  immediateJoiner: boolean("immediate_joiner").notNull().default(false),
  plan: text("plan").notNull().default("free"),
  dailyPostLimit: integer("daily_post_limit").notNull().default(50),
  postsFetchedOn: text("posts_fetched_on").notNull().default(""),
  postsFetchedToday: integer("posts_fetched_today").notNull().default(0),
  postsImportedOn: text("posts_imported_on").notNull().default(""),
  postsImportedToday: integer("posts_imported_today").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull()
});

export const smtpSettings = pgTable("smtp_settings", {
  userId: uuid("user_id").primaryKey(),
  host: text("host").notNull().default("smtp.gmail.com"),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  user: text("user").notNull().default(""),
  pass: text("pass").notNull().default(""),
  fromEmail: text("from_email").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  attachResume: boolean("attach_resume").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull()
});

export const linkedinPosts = pgTable(
  "linkedin_posts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    postedBy: text("posted_by").notNull().default(""),
    postedByUrl: text("posted_by_url").notNull().default(""),
    postedDate: text("posted_date").notNull().default(""),
    postedContent: text("posted_content").notNull().default(""),
    postUrl: text("post_url").notNull().default(""),
    emailsJson: text("emails_json").notNull().default("[]"),
    draftSkipReason: text("draft_skip_reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [
    uniqueIndex("linkedin_posts_user_url_content").on(table.userId, table.postedByUrl, table.postedContent)
  ]
);

export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    postId: integer("post_id").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name").notNull().default(""),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("draft"),
    phone: text("phone").notNull().default(""),
    location: text("location").notNull().default(""),
    company: text("company").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    hiringSummary: text("hiring_summary").notNull().default(""),
    talkingPoints: text("talking_points").notNull().default(""),
    jobPost: text("job_post").notNull().default(""),
    matchedSkills: text("matched_skills").notNull().default(""),
    called: boolean("called").notNull().default(false),
    calledAt: text("called_at").notNull().default(""),
    replied: boolean("replied").notNull().default(false),
    repliedAt: text("replied_at").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [uniqueIndex("email_drafts_user_post").on(table.userId, table.postId)]
);

export const emailSendLog = pgTable(
  "email_send_log",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    sentOn: text("sent_on").notNull(),
    draftId: integer("draft_id"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [
    uniqueIndex("email_send_log_user_email_day").on(table.userId, table.recipientEmail, table.sentOn)
  ]
);

export const draftNotes = pgTable("draft_notes", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull()
});

export const contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull(),
  plan: text("plan").notNull().default("general"),
  message: text("message").notNull().default(""),
  source: text("source").notNull().default("website"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull()
});

export const extensionConfig = pgTable("extension_config", {
  id: integer("id").primaryKey().default(1),
  requiredVersion: text("required_version").notNull().default("2.2.0"),
  updateUrl: text("update_url").notNull().default(""),
  message: text("message").notNull().default("Please install ReachPod extension 2.2.0 to continue."),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull()
});
