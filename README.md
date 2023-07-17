# unifi-protect-video-downloader

This will listen for motion events triggered from the unifi protect mqtt motion event service and download the corresponding video

## Docker setup

1. Mount a `/downloads` directory where videos will be downloaded. They will have the format`/{cameraName}/YYYY/MM/DD/${timestamp}.mp4`
2. Define the following ENV vars
   * `MQTT_HOST`: mqtt broker host, e.g. "mqtt://192.168.1.1",
   * `MQTT_USER`: username for connecting to mqtt broker
   * `MQTT_PASS`: password for connecting to mqtt broker
   * `UNIFI_HOST`: unifi protect host, e.g. "https://192.168.1.1:7443"
   * `UNIFI_USER`: username for unifi protect server (see directions below)
   * `UNIFI_PASS`: password for unifi protect server (see directions below)
   * `CAMERAS`: Optional - filter to only record camera with these names, e.g. 'Front Door, Driveway'
   * `LOG_LEVEL`: Optional - any one of the following winston logLevels. In increasing levels of verbosity: error, warn, info, verbose or debug. Default is `info`
   * `MOTION_GRACE_PERIOD`: Optional (in milliseconds) - the time to wait before ending recording period. If motion is detected in this time, it will be included in the initial download
   * `TZ`: Your time zone in IANA format. Default is `America/New_York`

## Unifi user account creation

1. Log in to Unifi Protect web ui and navigate to "users" section
2. Click "Invite User"
   1. For "Invite Type" select "Local Access Only"
   2. For "Roles", select "View Only"
3. Enter a username and password to use in docker setup
