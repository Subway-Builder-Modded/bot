const { MOD_ROLE_ID } = require('../constants');

async function memberHasRole(interaction, roleId) {
  if (!interaction.guild) return false;

  const cachedMember = interaction.member;
  if (cachedMember?.roles?.cache?.has?.(roleId)) {
    return true;
  }

  const freshMember = await interaction.guild.members.fetch(interaction.user.id);
  return freshMember.roles.cache.has(roleId);
}

async function memberHasModRole(interaction) {
  return memberHasRole(interaction, MOD_ROLE_ID);
}

module.exports = {
  memberHasModRole,
  memberHasRole,
};
