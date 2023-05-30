import { type Architecture, type PackageType } from 'db/package/types';

export type ClickParserApp = {
  name: string;
  type: string;
  features: string[];
  desktop: {
    [key: string]: string;
  };
  scopeIni: {
    [key: string]: string;
  };
  apparmor: {
    policy_groups: string[];
    policy_version: number;
    template?: string;
  };
  contentHub: {
    [key: string]: string[];
  };
  urlDispatcher: Array<{
    [key: string]: string;
  }>;
  pushHelper: {
    [key: string]: string;
  };
  accountService: {
    service?: {
      [key: string]: string;
    };
  };
  accountApplication: {
    application?: {
      services: {
        service: {
          [key: string]: string;
        };
      };
    };
  };
  webappProperties: {
    [key: string]: string;
  };
  webappInject: boolean;
  webappUrl: string | null;
  hooks: {
    [key: string]: string;
  };
  qmlImports: Array<{
    module: string;
    version: string;
  }>;
};

export interface ClickParserData {
  apps: ClickParserApp[];
  architecture: Architecture;
  description: string;
  changelog: string;
  framework: string;
  icon: string | null;
  maintainer: string;
  maintainerEmail: string;
  name: string;
  permissions: string[];
  title: string;
  types: PackageType[];
  urls: string[];
  version: string;
  installedSize: number;
  languages: string[];
  files: string[];
};
