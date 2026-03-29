const { ADMIN_ROLE_ID } = require('../constants');

async function memberHasRole(interaction, roleId) {
  if (!interaction.guild) return false;

  const cachedMember = interaction.member;
  if (cachedMember?.roles?.cache?.has?.(roleId)) {
    return true;
  }

  const freshMember = await interaction.guild.members.fetch(interaction.user.id);
  return freshMember.roles.cache.has(roleId);
}

async function memberHasAdminRole(interaction) {
  return memberHasRole(interaction, ADMIN_ROLE_ID);
}

module.exports = {
  memberHasAdminRole,
  memberHasRole,
};
