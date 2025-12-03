export function getBackendURL() {
  const ip = "192.168.0.100";  // auto-detected LAN IP
  return `http://${ip}:5000`;
}
