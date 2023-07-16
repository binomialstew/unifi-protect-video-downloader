const locale = 'en-US';
const timeZone = process.env.TZ || 'America/New_York';

const formatDateTime = (time) => {
  const date = new Date();
  if (time) {
    date.setTime(time);
  }
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
    hour12: false,
    timeZone,
  };

  const formatter = new Intl.DateTimeFormat(locale, options);
  const [
    { value: month },,
    { value: day },,
    { value: year },,
    { value: hour },,
    { value: minute },,
    { value: seconds },,
    { value: zone },
  ] = formatter.formatToParts(date);

  const formattedDate = `${year} ${month} ${day} - ${hour}:${minute}:${seconds} ${zone}`;

  return formattedDate;
};

module.exports = formatDateTime;
