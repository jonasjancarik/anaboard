export type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in';

export type AuthIdentity = {
  isAnonymous: boolean;
};

export type RemoteContext = {
  familyId: string;
  profileId: string;
  caregiverId: string;
  caregiverEmail: string;
};
