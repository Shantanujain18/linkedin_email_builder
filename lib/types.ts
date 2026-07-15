export type CandidateProfile = {
  name: string;
  yoe: string;
  top_skills: string;
  current_role: string;
  resume_link: string;
  phone: string;
  email: string;
  immediate_joiner?: boolean;
};

export type LinkedInPost = {
  id: number;
  postedBy: string;
  postedByUrl: string;
  postedDate: string;
  postedContent: string;
  postUrl: string;
  emails: string[];
};
