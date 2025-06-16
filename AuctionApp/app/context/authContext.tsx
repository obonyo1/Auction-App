import React, { createContext, useContext, useState } from 'react';

interface AuthContextType {
  username: string;
  setUsername: (username: string) => void;
  role: string;
  setRole: (role: string) => void;
}

// Create context with null instead of undefined, and proper typing
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<string>('');

  const value: AuthContextType = {
    username,
    setUsername,
    role,
    setRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthProvider;