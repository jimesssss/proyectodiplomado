const { withAppBuildGradle } = require('@expo/config-plugins');
function configureSigning(source) {
  source = source.replace(/applicationId "[^"]+"/, 'applicationId "com.erpsc.app"');
  if (source.includes('// ERP-SC release signing')) return source;
  const environment = `// ERP-SC release signing: configure an existing keystore outside this repository.
def erpscSigning = ['ERPSC_KEYSTORE_FILE', 'ERPSC_KEYSTORE_PASSWORD', 'ERPSC_KEY_ALIAS', 'ERPSC_KEY_PASSWORD'].collectEntries { [(it): System.getenv(it)] }
def erpscSigningReady = erpscSigning.values().every { it != null && !it.trim().isEmpty() }
`;
  source = environment + source;
  source = source.replace('    signingConfigs {', `    signingConfigs {
        release {
            if (erpscSigningReady) {
                storeFile file(erpscSigning['ERPSC_KEYSTORE_FILE'])
                storePassword erpscSigning['ERPSC_KEYSTORE_PASSWORD']
                keyAlias erpscSigning['ERPSC_KEY_ALIAS']
                keyPassword erpscSigning['ERPSC_KEY_PASSWORD']
            }
        }`);
  source = source.replace(/(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig signingConfigs.debug/, '$1signingConfig erpscSigningReady ? signingConfigs.release : null');
  source += `
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && (it.name == 'assembleRelease' || it.name == 'bundleRelease' || it.name == 'packageRelease') } && !erpscSigningReady) {
        throw new GradleException('Release requires ERPSC_KEYSTORE_FILE, ERPSC_KEYSTORE_PASSWORD, ERPSC_KEY_ALIAS and ERPSC_KEY_PASSWORD. Debug remains available.')
    }
}
`;
  return source;
}
module.exports = config => withAppBuildGradle(config, result => {
  result.modResults.contents = configureSigning(result.modResults.contents);
  return result;
});
module.exports.configureSigning = configureSigning;
