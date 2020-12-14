import fuzzy from 'fuzzy';
import {script_v1 as scriptV1} from 'googleapis';

import {loadAPICredentials, serviceUsage} from './auth';
import {ClaspError} from './clasp-error';
import {functionNamePrompt, functionNameSource} from './inquirer';
import {enableOrDisableAdvanceServiceInManifest} from './manifest';
import {ERROR} from './messages';
import {getProjectId, spinner, stopSpinner} from './utils';

import type {ReadonlyDeep} from 'type-fest';

type TypeFunction = Readonly<scriptV1.Schema$GoogleAppsScriptTypeFunction>;

/**
 * Prompts for the function name.
 */
export const getFunctionNames = async (script: ReadonlyDeep<scriptV1.Script>, scriptId: string): Promise<string> => {
  spinner.start('Getting functions');
  const content = await script.projects.getContent({scriptId});
  stopSpinner();
  if (content.status !== 200) {
    throw new ClaspError(content.statusText);
  }

  const {files = []} = content.data;
  const functionNames: string[] = files
    .reduce(
      (functions: ReadonlyArray<TypeFunction>, file: Readonly<scriptV1.Schema$File>) =>
        file.functionSet && file.functionSet.values ? [...functions, ...file.functionSet.values] : functions,
      []
    )
    .map((func: TypeFunction) => func.name) as string[];

  // Returns a Promise
  // https://www.npmjs.com/package/inquirer-autocomplete-prompt-ipt#options
  // Example: https://github.com/ruyadorno/inquirer-autocomplete-prompt/blob/master/example.js#L76
  const source: functionNameSource = async (_answers: object, input = '') =>
    fuzzy.filter(input, functionNames).map(element => element.original);

  return (await functionNamePrompt(source)).functionName;
};

/**
 * Gets the project ID from the manifest. If there is no project ID, it returns an error.
 */
const getProjectIdOrDie = async (): Promise<string> => {
  const projectId = await getProjectId(); // Will prompt user to set up if required
  if (projectId) {
    return projectId;
  }

  throw new ClaspError(ERROR.NO_GCLOUD_PROJECT);
};

// /**
//  * Returns true if the service is enabled for the Google Cloud Project.
//  * @param {string} serviceName The service name.
//  * @returns {boolean} True if the service is enabled.
//  */
// export async function isEnabled(serviceName: string): Promise<boolean> {
//   const serviceDetails = await serviceUsage.services.get({name: serviceName});
//   return serviceDetails.data.state === 'ENABLED';
// }

/**
 * Enables or disables a Google API.
 * @param {string} serviceName The name of the service. i.e. sheets
 * @param {boolean} enable Enables the API if true, otherwise disables.
 */
export const enableOrDisableAPI = async (serviceName: string, enable: boolean): Promise<void> => {
  if (!serviceName) {
    throw new ClaspError('An API name is required. Try sheets');
  }

  const name = `projects/${await getProjectIdOrDie()}/services/${serviceName}.googleapis.com`;
  try {
    if (enable) {
      await serviceUsage.services.enable({name});
    } else {
      await serviceUsage.services.disable({name});
    }

    await enableOrDisableAdvanceServiceInManifest(serviceName, enable);
    console.log(`${enable ? 'Enable' : 'Disable'}d ${serviceName} API.`);
  } catch (error) {
    if (error instanceof ClaspError) {
      throw error;
    }

    // If given non-existent API (like fakeAPI, it throws 403 permission denied)
    // We will log this for the user instead:
    console.log(error);

    throw new ClaspError(ERROR.NO_API(enable, serviceName));
  }
};

/**
 * Enable 'script.googleapis.com' of Google API.
 */
export const enableAppsScriptAPI = async (): Promise<void> => {
  await loadAPICredentials();
  const name = `projects/${await getProjectIdOrDie()}/services/script.googleapis.com`;
  await serviceUsage.services.enable({name});
};
